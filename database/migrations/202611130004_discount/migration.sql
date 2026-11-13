ALTER TABLE "Offer" ADD COLUMN "discountPercent" INTEGER GENERATED ALWAYS AS (
 CASE WHEN "originalPrice" IS NOT NULL AND "originalPrice" > 0
 THEN ROUND((1 - "price" / "originalPrice") * 100)::INTEGER ELSE NULL END
) STORED;
CREATE INDEX "Offer_discountPercent_idx" ON "Offer" ("discountPercent");
