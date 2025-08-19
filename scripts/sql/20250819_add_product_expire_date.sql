-- 2025-08-19: Add product_expire_date (Срок годности продукта) to offers
ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS product_expire_date DATE;
COMMENT ON COLUMN offers.product_expire_date IS 'Срок годности продукта (дата, без времени)';