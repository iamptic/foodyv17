from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
from ..db import SessionLocal
from .. import models, schemas

router = APIRouter(prefix="/api/v1/merchant/offers", tags=["merchant-offers"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("", response_model=List[schemas.OfferOut])
def list_offers(db: Session = Depends(get_db)):
    return db.query(models.Offer).order_by(models.Offer.id.desc()).all()

@router.post("", response_model=schemas.OfferOut, status_code=status.HTTP_201_CREATED)
def create_offer(payload: schemas.OfferCreate, db: Session = Depends(get_db)):
    obj = models.Offer(**payload.dict())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@router.patch("/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
def update_offer(offer_id: int, payload: schemas.OfferUpdate, db: Session = Depends(get_db)):
    obj = db.query(models.Offer).get(offer_id)
    if not obj:
        return
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    return

@router.delete("/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_offer(offer_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Offer).get(offer_id)
    if not obj:
        return
    db.delete(obj)
    db.commit()
    return