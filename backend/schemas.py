from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel

class OfferBase(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None
    photo_url: Optional[str] = None
    expires_at: Optional[datetime] = None
    product_expire_date: Optional[date] = None

class OfferCreate(OfferBase):
    title: str
    price: float
    stock: int

class OfferUpdate(OfferBase):
    pass

class OfferOut(OfferBase):
    id: int
    class Config:
        orm_mode = True