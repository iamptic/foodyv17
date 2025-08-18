# main.py
import os
from typing import Any, Dict, Optional, Set

import asyncpg
from fastapi import FastAPI, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone, time as dtime
import hashlib
import secrets as _secrets

APP_NAME = "Foody API"

DATABASE_URL = os.getenv("DATABASE_URL") or "postgresql://postgres:postgres@localhost:5432/postgres"
RUN_MIGRATIONS = os.getenv("RUN_MIGRATIONS", "1") == "1"

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()] or [
    "https://foodyweb-production.up.railway.app",
    "https://foodybot-production.up.railway.app",
]

RECOVERY_SECRET = os.getenv("RECOVERY_SECRET", "foodyDevRecover123")

app = FastAPI(title=APP_NAME, version="1.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

_pool: Optional[asyncpg.Pool] = None

async def _connect_pool():
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)

async def _close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None

async def _migrate():
    if not RUN_MIGRATIONS:
        return
    async with _pool.acquire() as conn:
        # merchants
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS merchants (
            id SERIAL PRIMARY KEY,
            name TEXT,
            login TEXT UNIQUE,
            auth_login TEXT,
            password_hash TEXT,
            api_key TEXT UNIQUE,
            phone TEXT,
            email TEXT,
            address TEXT,
            city TEXT,
            lat DOUBLE PRECISION,
            lng DOUBLE PRECISION,
            open_time TIME,
            close_time TIME,
            created_at TIMESTAMPTZ DEFAULT now()
        );
        """)
        for ddl in [
            "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS login TEXT;",
            "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS auth_login TEXT;",
            "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS open_time TIME;",
            "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS close_time TIME;",
        ]:
            await conn.execute(ddl)

        await conn.execute("""
        UPDATE merchants
           SET login = COALESCE(NULLIF(login,''), NULLIF(auth_login,''), NULLIF(phone,''), email)
         WHERE login IS NULL OR login = '';
        """)
        await conn.execute("""
        UPDATE merchants
           SET auth_login = COALESCE(NULLIF(auth_login,''), login)
         WHERE auth_login IS NULL OR auth_login = '';
        """)
        await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS merchants_login_unique ON merchants(login);")

        # offers
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS offers (
            id SERIAL PRIMARY KEY,
            merchant_id INTEGER,
            restaurant_id INTEGER,
            title TEXT NOT NULL,
            price_cents INTEGER NOT NULL DEFAULT 0,
            original_price_cents INTEGER,
            qty_total INTEGER NOT NULL DEFAULT 1,
            qty_left INTEGER NOT NULL DEFAULT 1,
            expires_at TIMESTAMPTZ,
            image_url TEXT,
            category TEXT,
            description TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
        );
        """)

        cols = await conn.fetch("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='offers' AND table_schema=current_schema()
        """)
        colset: Set[str] = {r["column_name"] for r in cols}

        if "merchant_id" not in colset:
            await conn.execute("ALTER TABLE offers ADD COLUMN IF NOT EXISTS merchant_id INTEGER;")
        if "restaurant_id" not in colset:
            await conn.execute("ALTER TABLE offers ADD COLUMN IF NOT EXISTS restaurant_id INTEGER;")
        if "created_at" not in colset:
            await conn.execute("ALTER TABLE offers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();")

        await conn.execute("UPDATE offers SET restaurant_id = COALESCE(restaurant_id, merchant_id) WHERE restaurant_id IS NULL;")
        await conn.execute("UPDATE offers SET merchant_id   = COALESCE(merchant_id, restaurant_id) WHERE merchant_id IS NULL;")

def _hash_password(pw: str) -> str:
    salt = hashlib.sha256(RECOVERY_SECRET.encode()).hexdigest()[:16]
    return hashlib.sha256((salt + pw).encode()).hexdigest()

def _generate_api_key() -> str:
    return _secrets.token_hex(24)

def _to_time_str(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, str):
        return val[:5]
    try:
        return val.strftime("%H:%M")
    except Exception:
        return None

def _parse_time(val: Any) -> Optional[dtime]:
    if not val:
        return None
    if isinstance(val, dtime):
        return val
    if isinstance(val, str):
        s = val.strip()
        if not s:
            return None
        parts = s.split(":")
        try:
            h = int(parts[0]); m = int(parts[1]) if len(parts) > 1 else 0; s2 = int(parts[2]) if len(parts) > 2 else 0
            if h == 24 and m == 0 and s2 == 0: return dtime(23, 59, 59)
            return dtime(h, m, s2)
        except Exception:
            return None
    return None

def _parse_expires_at(s: str) -> Optional[datetime]:
    if not s:
        return None
    try:
        if s.endswith("Z"):
            return datetime.fromisoformat(s.replace("Z","+00:00"))
        return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    except Exception:
        return None

async def _require_auth(conn: asyncpg.Connection, restaurant_id: int, api_key: str):
    if not api_key:
        raise HTTPException(status_code=401, detail="missing api key")
    row = await conn.fetchrow("SELECT id FROM merchants WHERE id=$1 AND api_key=$2", restaurant_id, api_key)
    if not row:
        raise HTTPException(status_code=401, detail="invalid api key")

def _get_api_key(req: Request) -> str:
    return req.headers.get("X-Foody-Key") or req.headers.get("x-foody-key") or ""

class RegisterRequest(BaseModel):
    name: str
    login: str
    password: str
    city: Optional[str] = None

class LoginRequest(BaseModel):
    login: str
    password: str

class OfferCreate(BaseModel):
    merchant_id: Optional[int] = None
    restaurant_id: int
    title: str
    price: float
    original_price: Optional[float] = None
    qty_total: int = 1
    qty_left: Optional[int] = None
    expires_at: str
    image_url: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None

@app.on_event("startup")
async def startup_event():
    await _connect_pool()
    await _migrate()

@app.on_event("shutdown")
async def shutdown_event():
    await _close_pool()

@app.get("/health")
async def health():
    return {"ok": True, "service": APP_NAME}

@app.post("/api/v1/merchant/register_public")
async def register_public(payload: RegisterRequest):
    async with _pool.acquire() as conn:
        login_digits = "".join([c for c in payload.login if c.isdigit()])
        exists = await conn.fetchrow("SELECT id FROM merchants WHERE login=$1", login_digits)
        if exists:
            raise HTTPException(status_code=409, detail="merchant with this login already exists")
        api_key = _generate_api_key()
        password_hash = _hash_password(payload.password)
        row = await conn.fetchrow(
            """
            INSERT INTO merchants (name, login, phone, city, password_hash, api_key, auth_login)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING id
            """,
            payload.name.strip(), login_digits, login_digits, payload.city, password_hash, api_key, login_digits
        )
        return {"restaurant_id": row["id"], "api_key": api_key}

@app.post("/api/v1/merchant/login")
async def login(payload: LoginRequest):
    async with _pool.acquire() as conn:
        login_digits = "".join([c for c in payload.login if c.isdigit()])
        row = await conn.fetchrow("SELECT id, password_hash, api_key FROM merchants WHERE login=$1", login_digits)
        if not row or row["password_hash"] != _hash_password(payload.password):
            raise HTTPException(status_code=401, detail="invalid login or password")
        return {"restaurant_id": row["id"], "api_key": row["api_key"]}

@app.get("/api/v1/merchant/profile")
async def get_profile(restaurant_id: int, request: Request):
    api_key = _get_api_key(request)
    async with _pool.acquire() as conn:
        await _require_auth(conn, restaurant_id, api_key)
        row = await conn.fetchrow(
            "SELECT id, name, login, phone, email, address, city, lat, lng, open_time, close_time FROM merchants WHERE id=$1",
            restaurant_id
        )
        if not row:
            raise HTTPException(status_code=404, detail="not found")
        d = dict(row)
        d["open_time"] = _to_time_str(d.get("open_time"))
        d["close_time"] = _to_time_str(d.get("close_time"))
        d["work_from"] = d["open_time"]
        d["work_to"] = d["close_time"]
        return d

@app.put("/api/v1/merchant/profile")
async def update_profile(payload: Dict[str, Any] = Body(...), request: Request = None):
    restaurant_id = int(payload.get("restaurant_id") or 0)
    if not restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    api_key = _get_api_key(request) if request else ""

    async with _pool.acquire() as conn:
        await _require_auth(conn, restaurant_id, api_key)

        name    = (payload.get("name") or "").strip() or None
        phone   = (payload.get("phone") or "").strip() or None
        address = (payload.get("address") or "").strip() or None
        city    = (payload.get("city") or "").strip() or None
        lat     = payload.get("lat", None)
        lng     = payload.get("lng", None)

        open_time_raw  = payload.get("open_time")  or payload.get("work_from") or None
        close_time_raw = payload.get("close_time") or payload.get("work_to")   or None
        open_time  = _parse_time(open_time_raw)
        close_time = _parse_time(close_time_raw)

        await conn.execute(
            """
            UPDATE merchants SET
                name       = COALESCE($2, name),
                phone      = COALESCE($3, phone),
                address    = COALESCE($4, address),
                city       = COALESCE($5, city),
                lat        = COALESCE($6, lat),
                lng        = COALESCE($7, lng),
                open_time  = COALESCE($8, open_time),
                close_time = COALESCE($9, close_time)
            WHERE id = $1
            """,
            restaurant_id, name, phone, address, city, lat, lng, open_time, close_time
        )
        return {"ok": True}

@app.get("/api/v1/merchant/offers")
async def list_offers(restaurant_id: int, request: Request):
    api_key = _get_api_key(request)
    async with _pool.acquire() as conn:
        await _require_auth(conn, restaurant_id, api_key)
        rows = await conn.fetch(
            """
            SELECT id, restaurant_id, title, price_cents, original_price_cents, qty_total, qty_left,
                   expires_at, image_url, category, description
            FROM offers
            WHERE restaurant_id=$1
            ORDER BY created_at DESC
            """,
            restaurant_id
        )
        out = []
        for r in rows:
            d = dict(r)
            if d.get("expires_at"):
                d["expires_at"] = d["expires_at"].astimezone(timezone.utc).isoformat()
            out.append(d)
        return out

# --- PATCH/DELETE for offers ---
class OfferUpdate(BaseModel):
    title: Optional[str] = None
    price: Optional[float] = None
    original_price: Optional[float] = None
    qty_total: Optional[int] = None
    qty_left: Optional[int] = None
    expires_at: Optional[str] = None
    image_url: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None

@app.patch("/api/v1/merchant/offers/{offer_id}")
async def update_offer(offer_id: int, payload: OfferUpdate = Body(...), request: Request = None):
    api_key = _get_api_key(request) if request else ""
    async with _pool.acquire() as conn:
        offer_row = await conn.fetchrow("SELECT id, restaurant_id, qty_total, qty_left FROM offers WHERE id=$1", offer_id)
        if not offer_row:
            raise HTTPException(status_code=404, detail="offer not found")
        restaurant_id = int(offer_row["restaurant_id"] or 0)
        await _require_auth(conn, restaurant_id, api_key)

        cols = await conn.fetch("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='offers' AND table_schema=current_schema()
        """)
        colset = {r["column_name"] for r in cols}

        data = payload.dict(exclude_unset=True)
        updates = {}

        if "title" in data: updates["title"] = data["title"]
        if "description" in data: updates["description"] = data["description"]
        if "category" in data: updates["category"] = data["category"]
        if "image_url" in data: updates["image_url"] = (data["image_url"] or "").strip()

        if "price" in data and data["price"] is not None:
            price_val = float(data["price"])
            if "price" in colset: updates["price"] = price_val
            if "price_cents" in colset: updates["price_cents"] = int(round(price_val * 100))

        if "original_price" in data and data["original_price"] is not None:
            orig_val = float(data["original_price"])
            if "original_price" in colset: updates["original_price"] = orig_val
            if "original_price_cents" in colset: updates["original_price_cents"] = int(round(orig_val * 100))

        current_qty_total = offer_row["qty_total"]
        current_qty_left = offer_row["qty_left"]
        new_qty_total = data.get("qty_total", current_qty_total)
        new_qty_left  = data.get("qty_left", current_qty_left)
        if new_qty_total is not None and new_qty_left is not None and int(new_qty_left) > int(new_qty_total):
            raise HTTPException(status_code=400, detail="qty_left cannot be greater than qty_total")
        if "qty_total" in data and "qty_total" in colset: updates["qty_total"] = int(new_qty_total)
        if "qty_left" in data and "qty_left" in colset: updates["qty_left"] = int(new_qty_left)

        if "expires_at" in data:
            parsed = _parse_expires_at(data["expires_at"]) if data["expires_at"] else None
            updates["expires_at"] = parsed

        set_parts, values, idx = [], [], 1
        for k, v in updates.items():
            if k not in colset: continue
            set_parts.append(f"{k} = ${idx}"); values.append(v); idx += 1
        if not set_parts:
            row = await conn.fetchrow(
                """SELECT id, restaurant_id, title, price, price_cents, original_price, original_price_cents,
                          qty_total, qty_left, expires_at, image_url, category, description
                   FROM offers WHERE id=$1""",
                offer_id
            )
            d = dict(row)
            if d.get("expires_at"):
                d["expires_at"] = d["expires_at"].astimezone(timezone.utc).isoformat()
            return d

        values.append(offer_id)
        await conn.execute(f"UPDATE offers SET {', '.join(set_parts)} WHERE id = ${idx}", *values)

        row = await conn.fetchrow(
            """SELECT id, restaurant_id, title, price_cents, original_price_cents, qty_total, qty_left,
                      expires_at, image_url, category, description
               FROM offers WHERE id=$1""",
            offer_id
        )
        d = dict(row)
        if d.get("expires_at"):
            d["expires_at"] = d["expires_at"].astimezone(timezone.utc).isoformat()
        return d

@app.delete("/api/v1/merchant/offers/{offer_id}", status_code=204)
async def delete_offer(offer_id: int, request: Request = None):
    api_key = _get_api_key(request) if request else ""
    async with _pool.acquire() as conn:
        offer_row = await conn.fetchrow("SELECT id, restaurant_id FROM offers WHERE id=$1", offer_id)
        if not offer_row:
            raise HTTPException(status_code=404, detail="offer not found")
        restaurant_id = int(offer_row["restaurant_id"] or 0)
        await _require_auth(conn, restaurant_id, api_key)
        await conn.execute("DELETE FROM offers WHERE id=$1", offer_id)
        return

@app.get("/")
async def root():
    return {"ok": True, "service": APP_NAME}

@app.put("/api/v1/merchant/password")
async def change_password(payload: dict = Body(...), request: Request = None):
    restaurant_id = int(payload.get("restaurant_id") or 0)
    old_password = (payload.get("old_password") or "").strip()
    new_password = (payload.get("new_password") or "").strip()
    if not restaurant_id or not old_password or not new_password:
        raise HTTPException(status_code=400, detail="restaurant_id, old_password, new_password required")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="new password too short")

    api_key = request.headers.get("X-Foody-Key") if request else ""
    if not api_key:
        api_key = request.headers.get("x-foody-key") if request else ""
    async with _pool.acquire() as conn:
        await _require_auth(conn, restaurant_id, api_key)
        row = await conn.fetchrow("SELECT password_hash FROM merchants WHERE id=$1", restaurant_id)
        if not row or row["password_hash"] != _hash_password(old_password):
            raise HTTPException(status_code=401, detail="invalid current password")
        await conn.execute("UPDATE merchants SET password_hash=$2 WHERE id=$1", restaurant_id, _hash_password(new_password))
        return {"ok": True}
