BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Catálogo por marca: productos, combos y sus ítems. Aditivo: no toca filas existentes.
-- El código solo consulta estas tablas con PRODUCT_CATALOG_ENABLED=true (migrar antes de encenderlo);
-- la procedencia de los datos de ejemplo las usa solo si existen (to_regclass).
-- Sin IF NOT EXISTS, como las demás migraciones: si las tablas ya existen (p. ej. creadas con
-- db push), falla en vez de darse por aplicada sin los CHECK de kind, name y quantity.
CREATE TABLE "BrandProduct" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'PRODUCTO',
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "aiNotes" TEXT,
  "features" TEXT NOT NULL DEFAULT '[]',
  "benefits" TEXT NOT NULL DEFAULT '[]',
  "objections" TEXT NOT NULL DEFAULT '[]',
  "priceLabel" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrandProduct_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BrandProduct_kind_check" CHECK ("kind" IN ('PRODUCTO','SERVICIO','RESTAURANTE')),
  CONSTRAINT "BrandProduct_name_check" CHECK (btrim("name") <> '' AND length("name") <= 120),
  CONSTRAINT "BrandProduct_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BrandProduct_brandId_slug_key" ON "BrandProduct"("brandId", "slug");
-- Destino de la FK compuesta: un combo solo puede incluir productos de su misma marca.
CREATE UNIQUE INDEX "BrandProduct_id_brandId_key" ON "BrandProduct"("id", "brandId");
CREATE INDEX "BrandProduct_brandId_active_idx" ON "BrandProduct"("brandId", "active");

CREATE TABLE "BrandCombo" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'PRODUCTO',
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "aiNotes" TEXT,
  "priceLabel" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrandCombo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BrandCombo_kind_check" CHECK ("kind" IN ('PRODUCTO','SERVICIO','RESTAURANTE')),
  CONSTRAINT "BrandCombo_name_check" CHECK (btrim("name") <> '' AND length("name") <= 120),
  CONSTRAINT "BrandCombo_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BrandCombo_brandId_slug_key" ON "BrandCombo"("brandId", "slug");
CREATE UNIQUE INDEX "BrandCombo_id_brandId_key" ON "BrandCombo"("id", "brandId");
CREATE INDEX "BrandCombo_brandId_active_idx" ON "BrandCombo"("brandId", "active");

CREATE TABLE "BrandComboItem" (
  "comboId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "BrandComboItem_pkey" PRIMARY KEY ("comboId", "productId"),
  CONSTRAINT "BrandComboItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "BrandComboItem_comboId_brandId_fkey" FOREIGN KEY ("comboId", "brandId") REFERENCES "BrandCombo"("id", "brandId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BrandComboItem_productId_brandId_fkey" FOREIGN KEY ("productId", "brandId") REFERENCES "BrandProduct"("id", "brandId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BrandComboItem_productId_idx" ON "BrandComboItem"("productId");

-- Revisión monótona para lockRevision, igual que el resto de tablas editables.
CREATE OR REPLACE TRIGGER intia_revision BEFORE UPDATE ON "BrandProduct" FOR EACH ROW EXECUTE FUNCTION intia_revision();
CREATE OR REPLACE TRIGGER intia_revision BEFORE UPDATE ON "BrandCombo" FOR EACH ROW EXECUTE FUNCTION intia_revision();
COMMIT;
