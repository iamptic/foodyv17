import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import Base, engine, ensure_columns
from .routers import merchant_offers
from . import models

app = FastAPI(title="Foody Backend")

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "https://foodyweb-production.up.railway.app,https://foodybot-production.up.railway.app")
origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)
ensure_columns()

app.include_router(merchant_offers.router)

@app.get("/health")
def health():
    return {"ok": True}