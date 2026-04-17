-- =========================================================
-- 1. Справочники атрибутов (материал / аромат / форма)
-- =========================================================
CREATE TABLE public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name_ru text NOT NULL,
  name_en text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.scents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name_ru text NOT NULL,
  name_en text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.shapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name_ru text NOT NULL,
  name_en text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shapes    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read materials" ON public.materials FOR SELECT USING (true);
CREATE POLICY "Admins manage materials" ON public.materials FOR ALL
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Public read scents" ON public.scents FOR SELECT USING (true);
CREATE POLICY "Admins manage scents" ON public.scents FOR ALL
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Public read shapes" ON public.shapes FOR SELECT USING (true);
CREATE POLICY "Admins manage shapes" ON public.shapes FOR ALL
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Связи продукта со справочниками
ALTER TABLE public.products
  ADD COLUMN material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  ADD COLUMN scent_id    uuid REFERENCES public.scents(id)    ON DELETE SET NULL,
  ADD COLUMN shape_id    uuid REFERENCES public.shapes(id)    ON DELETE SET NULL;

CREATE INDEX idx_products_material ON public.products(material_id);
CREATE INDEX idx_products_scent    ON public.products(scent_id);
CREATE INDEX idx_products_shape    ON public.products(shape_id);

-- =========================================================
-- 2. Галерея изображений товара
-- =========================================================
CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_images_product ON public.product_images(product_id, sort_order);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read product_images" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "Admins manage product_images" ON public.product_images FOR ALL
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- =========================================================
-- 3. Склад: резервы + журнал движений + webhook-токен
-- =========================================================
ALTER TABLE public.product_variants
  ADD COLUMN reserved_boxes int NOT NULL DEFAULT 0,
  ADD COLUMN external_id text,                  -- id во внешней системе (1С/МойСклад)
  ADD COLUMN last_synced_at timestamptz;

CREATE TYPE public.stock_movement_type AS ENUM (
  'in',         -- приход
  'out',        -- расход (отгрузка)
  'reserve',    -- резерв под заявку
  'release',    -- снятие резерва
  'adjust',     -- корректировка
  'sync'        -- синхронизация с внешней СУ
);

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  type public.stock_movement_type NOT NULL,
  qty_boxes int NOT NULL,
  source text,                  -- 'admin' | 'order' | 'webhook' | '1c' | ...
  ref_id text,                  -- order_id / external doc id
  comment text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_movements_variant ON public.stock_movements(variant_id, created_at DESC);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read stock_movements"  ON public.stock_movements FOR SELECT
  USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write stock_movements" ON public.stock_movements FOR INSERT
  WITH CHECK (has_role(auth.uid(),'admin'));

-- =========================================================
-- 4. Настройки компании (для счёта-договора и контактов)
-- =========================================================
CREATE TABLE public.company_settings (
  id int PRIMARY KEY DEFAULT 1,
  legal_name text NOT NULL DEFAULT 'ООО «Свечной двор»',
  short_name text NOT NULL DEFAULT 'Свечной двор',
  inn text NOT NULL DEFAULT '',
  kpp text NOT NULL DEFAULT '',
  ogrn text NOT NULL DEFAULT '',
  legal_address text NOT NULL DEFAULT '',
  postal_address text NOT NULL DEFAULT '',
  bank_name text NOT NULL DEFAULT '',
  bank_bik text NOT NULL DEFAULT '',
  bank_account text NOT NULL DEFAULT '',
  corr_account text NOT NULL DEFAULT '',
  director_name text NOT NULL DEFAULT '',
  director_position text NOT NULL DEFAULT 'Генеральный директор',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  offer_text text NOT NULL DEFAULT 'Настоящий счёт-договор является публичной офертой. Оплата счёта означает согласие с условиями поставки.',
  payment_terms text NOT NULL DEFAULT 'Оплата по безналичному расчёту в течение 3 банковских дней с момента выставления счёта.',
  delivery_terms text NOT NULL DEFAULT 'Отгрузка со склада в Москве. Доставка по согласованию.',
  signature_url text,
  stamp_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);

INSERT INTO public.company_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read company_settings" ON public.company_settings FOR SELECT USING (true);
CREATE POLICY "Admins update company_settings" ON public.company_settings FOR UPDATE
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_company_settings_updated
BEFORE UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 5. Storage bucket для подписи/печати/брендинга
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets','company-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read company-assets" ON storage.objects FOR SELECT
  USING (bucket_id = 'company-assets');
CREATE POLICY "Admins write company-assets" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'company-assets' AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update company-assets" ON storage.objects FOR UPDATE
  USING (bucket_id = 'company-assets' AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete company-assets" ON storage.objects FOR DELETE
  USING (bucket_id = 'company-assets' AND has_role(auth.uid(),'admin'));

-- =========================================================
-- 6. Сидируем справочники начальными значениями
-- =========================================================
INSERT INTO public.materials (slug,name_ru,name_en,sort_order) VALUES
  ('paraffin','Парафин','Paraffin',1),
  ('soy','Соевый воск','Soy wax',2),
  ('beeswax','Пчелиный воск','Beeswax',3),
  ('palm','Пальмовый воск','Palm wax',4),
  ('coconut','Кокосовый воск','Coconut wax',5)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scents (slug,name_ru,name_en,sort_order) VALUES
  ('unscented','Без аромата','Unscented',1),
  ('vanilla','Ваниль','Vanilla',2),
  ('lavender','Лаванда','Lavender',3),
  ('sandalwood','Сандал','Sandalwood',4),
  ('citrus','Цитрус','Citrus',5),
  ('coffee','Кофе','Coffee',6),
  ('cinnamon','Корица','Cinnamon',7)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.shapes (slug,name_ru,name_en,sort_order) VALUES
  ('pillar','Колонна','Pillar',1),
  ('taper','Конусная','Taper',2),
  ('tealight','Чайная','Tealight',3),
  ('container','В стакане','Container',4),
  ('votive','Вотивная','Votive',5),
  ('floating','Плавающая','Floating',6),
  ('figure','Фигурная','Figure',7)
ON CONFLICT (slug) DO NOTHING;
