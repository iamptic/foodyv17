from sqlalchemy import Column, Integer, String, Numeric, DateTime, Date
from sqlalchemy.sql import func
from .db import Base

class Offer(Base):
    __tablename__ = 'offers'
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String)
    price = Column(Numeric, nullable=False)
    stock = Column(Integer, nullable=False, default=0)
    photo_url = Column(String)
    expires_at = Column(DateTime(timezone=True))
    product_expire_date = Column(Date)
    # опциональные агрегаты, если есть
    reservations_count = Column(Integer)
    redemptions_count = Column(Integer)