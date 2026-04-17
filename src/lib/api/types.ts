/**
 * TypeScript types that mirror the FastAPI backend (`/backend/app/schemas`).
 *
 * Kept hand-written for now so the frontend can be refactored without blocking
 * on `openapi-typescript` plumbing — that lands in step 10.
 */

// ---------- auth ----------

export type AppRole = "admin" | "client";

export type UserOut = {
  id: string;
  email: string;
  role: AppRole;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  inn: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
  is_admin: boolean;
};

export type LoginOut = {
  access: string;
  refresh: string;
  token_type: "bearer";
  user: UserOut;
};

export type AccessToken = {
  access: string;
  token_type: "bearer";
};

export type PasswordResetRequestOut = {
  ok: true;
  reset_token: string | null;
};

// ---------- catalog ----------

export type CategoryOut = {
  id: string;
  slug: string;
  name_ru: string;
  name_en: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CategoryRef = {
  slug: string;
  name_ru: string;
  name_en: string;
};

export type AttributeOut = {
  id: string;
  slug: string;
  name_ru: string;
  name_en: string;
  sort_order: number;
  created_at: string;
};

export type AttributeKind = "materials" | "scents" | "shapes";

export type ProductVariantOut = {
  id: string;
  product_id: string;
  sku: string;
  size: string | null;
  color: string | null;
  shape: string | null;
  pieces_per_box: number;
  price_per_piece_rub: number;
  price_per_piece_usd: number;
  stock_boxes: number;
  reserved_boxes: number;
  external_id: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductImageOut = {
  id: string;
  product_id: string;
  url: string;
  alt: string | null;
  sort_order: number;
  created_at: string;
};

export type ProductOut = {
  id: string;
  slug: string;
  category_id: string | null;
  material_id: string | null;
  scent_id: string | null;
  shape_id: string | null;
  name_ru: string;
  name_en: string;
  description_ru: string | null;
  description_en: string | null;
  image_url: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  variants: ProductVariantOut[];
  images: ProductImageOut[];
  category: CategoryRef | null;
  material: AttributeOut | null;
  scent: AttributeOut | null;
  shape: AttributeOut | null;
};

export type CategoryCreate = {
  slug: string;
  name_ru: string;
  name_en: string;
  parent_id?: string | null;
  sort_order?: number;
};

export type CategoryUpdate = Partial<CategoryCreate>;

export type AttributeCreate = {
  slug: string;
  name_ru: string;
  name_en: string;
  sort_order?: number;
};

export type AttributeUpdate = Partial<AttributeCreate>;

export type ProductCreate = {
  slug: string;
  name_ru: string;
  name_en: string;
  category_id?: string | null;
  material_id?: string | null;
  scent_id?: string | null;
  shape_id?: string | null;
  description_ru?: string | null;
  description_en?: string | null;
  image_url?: string | null;
  is_published?: boolean;
};

export type ProductUpdate = Partial<ProductCreate>;

export type ProductVariantCreate = {
  sku: string;
  size?: string | null;
  color?: string | null;
  shape?: string | null;
  pieces_per_box: number;
  price_per_piece_rub: number;
  price_per_piece_usd: number;
  stock_boxes?: number;
  external_id?: string | null;
};

export type ProductVariantUpdate = Partial<ProductVariantCreate>;

export type ProductImageCreate = {
  url: string;
  alt?: string | null;
  sort_order?: number;
};

export type ProductImageUpdate = Partial<ProductImageCreate>;

// ---------- orders ----------

export type OrderStatus =
  | "new"
  | "processing"
  | "invoiced"
  | "paid"
  | "shipped"
  | "completed"
  | "cancelled";

export type Currency = "RUB" | "USD";

export type OrderItemIn = {
  variant_id: string | null;
  sku: string;
  product_name: string;
  variant_label: string | null;
  pieces_per_box: number;
  boxes: number;
  unit_price: number;
};

export type OrderItemOut = {
  id: string;
  order_id: string;
  variant_id: string | null;
  sku: string;
  product_name: string;
  variant_label: string | null;
  pieces_per_box: number;
  boxes: number;
  unit_price: number;
  line_total: number;
  created_at: string;
};

export type OrderBase = {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  currency: Currency;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  total: number;
  total_boxes: number;
  delivery_address: string | null;
  delivery_date: string | null;
  customer_comment: string | null;
  admin_comment: string | null;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  inn: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderOut = OrderBase & {
  items: OrderItemOut[];
};

export type OrderListOut = OrderBase;

export type OrderCreate = {
  currency?: Currency;
  delivery_address?: string | null;
  delivery_date?: string | null;
  customer_comment?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  inn?: string | null;
  email?: string | null;
  items: OrderItemIn[];
};

export type OrderUpdateAdmin = {
  status?: OrderStatus;
  admin_comment?: string | null;
};

// ---------- stock / inventory / discounts ----------

export type DiscountTierOut = {
  id: string;
  min_boxes: number;
  discount_percent: number;
  created_at: string;
};

export type DiscountTierCreate = {
  min_boxes: number;
  discount_percent: number;
};

export type DiscountTierUpdate = Partial<DiscountTierCreate>;

export type StockVariantOut = {
  id: string;
  sku: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  stock_boxes: number;
  reserved_boxes: number;
  external_id: string | null;
  last_synced_at: string | null;
};

export type StockOpIn = {
  variant_id: string;
  type: "in" | "out" | "adjust";
  qty_boxes: number;
  comment?: string | null;
};

export type InventorySyncOut = {
  ok: true;
  count: number;
  snapshot: Array<{
    id: string;
    sku: string;
    external_id: string | null;
    stock_boxes: number;
    reserved_boxes: number;
    last_synced_at: string | null;
    product_name: string | null;
    product_slug: string | null;
  }>;
};

// ---------- company ----------

export type CompanySettingsOut = {
  id: number;
  legal_name: string;
  short_name: string;
  inn: string;
  kpp: string;
  ogrn: string;
  legal_address: string;
  postal_address: string;
  bank_name: string;
  bank_bik: string;
  bank_account: string;
  corr_account: string;
  director_name: string;
  director_position: string;
  phone: string;
  email: string;
  offer_text: string;
  payment_terms: string;
  delivery_terms: string;
  signature_url: string | null;
  stamp_url: string | null;
  updated_at: string;
};

export type CompanySettingsUpdate = Partial<Omit<CompanySettingsOut, "id" | "updated_at">>;

// ---------- uploads ----------

export type UploadOut = {
  url: string;
};

// ---------- profile ----------

export type ProfileUpdateIn = {
  company_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  inn?: string | null;
  address?: string | null;
};
