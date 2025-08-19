import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv('DATABASE_URL')
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def ensure_columns():
    with engine.begin() as conn:
        conn.execute(text("""
        ALTER TABLE offers
            ADD COLUMN IF NOT EXISTS product_expire_date DATE
        """))