import type { CategoryOut, ProductOut, ProductPageOut, ProductVariantOut, ProductListParams } from "./types";

const now = "2026-01-01T00:00:00Z";
const image = "/placeholder.svg";

const category = (id: string, slug: string, name: string, parent_id: string | null, sort_order: number): CategoryOut => ({
  id, slug, name_ru: name, name_en: name, icon: null, parent_id, sort_order,
  show_on_home: false, home_image_url: null, created_at: now, updated_at: now,
});

export const MOCK_CATEGORIES: CategoryOut[] = [
  category("interior", "interior", "Интерьерные", null, 1),
  category("cylinders", "cylinders", "Цилиндры", "interior", 1),
  category("pillars", "pillars", "Столбовые", "interior", 2),
  category("table", "table-candles", "Столовые", null, 2),
];

const variant = (productId: string, id: string, sku: string, size: string, color: string, stock_boxes: number): ProductVariantOut => ({
  id, product_id: productId, sku, size, color, shape: null, manufacturing_method: "Пресованные",
  has_scent: false, pieces_per_box: 1, price_per_piece_rub: 100, price_per_piece_usd: 1.2,
  length_mm: null, width_mm: 48, height_mm: Number(size.split("x")[1] ?? 100), weight_gr: null,
  burn_time_hours: 20, packages_per_box: 1, box_length_mm: null, box_width_mm: null,
  box_height_mm: null, box_weight_gr: null, stock_boxes, reserved_boxes: 0, image_url: image,
  external_id: null, last_synced_at: null, created_at: now, updated_at: now, volume_discounts: [], images: [],
});

const product = (id: string, slug: string, name: string, category_id: string, color: string, sizes: string[], stock = 2): ProductOut => ({
  id, slug, category_id, material_id: null, scent_id: null, shape_id: null, name_ru: name, name_en: name,
  description_ru: null, description_en: null, image_url: image, is_published: true, created_at: now, updated_at: now,
  variants: sizes.map((size, index) => variant(id, `${id}-v${index + 1}`, `${id.toUpperCase()}-${size}-${color}`, size, color, stock)),
  images: [], category: null, material: null, scent: null, shape: null,
});

export const MOCK_PRODUCTS: ProductOut[] = [
  product("cyl-tiffany", "cyl-tiffany", "Цилиндры Ø48", "cylinders", "Тиффани", ["48x75", "48x100", "48x150", "48x190"]),
  product("cyl-blue", "cyl-blue", "Цилиндры Ø48", "cylinders", "Синий", ["48x75", "48x150"], 0),
  product("pillar-white", "pillar-white", "Столбовые свечи", "pillars", "Белый", ["50x100", "50x150"]),
  product("table-green", "table-green", "Столовые свечи", "table", "Зелёный", ["20x300"]),
];

export const mockCatalogApi = {
  listCategories: async () => MOCK_CATEGORIES,
  listProductColors: async () => ["Тиффани", "Синий", "Белый", "Зелёный"],
  searchProducts: async (_params: ProductListParams = {}): Promise<ProductPageOut> => ({
    items: MOCK_PRODUCTS,
    total: MOCK_PRODUCTS.length,
    page: 1,
    page_size: MOCK_PRODUCTS.length,
    pages: 1,
    has_next: false,
    has_previous: false,
  }),
};
