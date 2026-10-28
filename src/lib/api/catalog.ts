import { http } from "./client";
import { mockCatalogApi } from "./catalogMock";
import type {
  AttributeCreate,
  AttributeKind,
  AttributeOut,
  AttributeUpdate,
  CategoryCreate,
  CategoryOut,
  CategoryUpdate,
  ProductCreate,
  ProductImageCreate,
  ProductImageOut,
  ProductImageUpdate,
  ProductOut,
  ProductListParams,
  ProductPageOut,
  ProductUpdate,
  ProductVariantCreate,
  ProductVariantOut,
  ProductVariantUpdate,
  VariantImageCreate,
  VariantImageOut,
  VolumeDiscountCreate,
  VolumeDiscountOut,
} from "./types";

const PRODUCT_PAGE_SIZE = 200;
const MAX_PRODUCT_PAGES = 250;
const USE_MOCK_CATALOG = import.meta.env.VITE_MOCK_CATALOG === "true";

/**
 * The backend intentionally caps list responses. Catalog screens currently
 * filter and paginate locally, so their API boundary must assemble every
 * server page before handing data to the UI.
 */
const listAllProducts = async (url: string): Promise<ProductOut[]> => {
  const result: ProductOut[] = [];
  const seenIds = new Set<string>();
  let offset = 0;

  for (let pageNumber = 0; pageNumber < MAX_PRODUCT_PAGES; pageNumber += 1) {
    const page = await http.get<ProductOut[]>(url, {
      params: { offset, limit: PRODUCT_PAGE_SIZE },
    });
    if (!Array.isArray(page)) {
      throw new TypeError(`Expected an array response from ${url}`);
    }

    let added = 0;
    for (const product of page) {
      if (!seenIds.has(product.id)) {
        seenIds.add(product.id);
        result.push(product);
        added += 1;
      }
    }

    if (page.length < PRODUCT_PAGE_SIZE) return result;
    if (added === 0) {
      throw new Error(`Pagination made no progress while loading ${url}`);
    }
    offset += page.length;
  }

  throw new Error(`Catalog exceeds the supported ${MAX_PRODUCT_PAGES} pages`);
};

export const catalogApi = {
  // ---------- categories ----------
  listCategories: () => USE_MOCK_CATALOG ? mockCatalogApi.listCategories() : http.get<CategoryOut[]>("/categories"),
  createCategory: (body: CategoryCreate) => http.post<CategoryOut>("/admin/categories", body),
  updateCategory: (id: string, body: CategoryUpdate) =>
    http.patch<CategoryOut>(`/admin/categories/${id}`, body),
  deleteCategory: (id: string) => http.delete<void>(`/admin/categories/${id}`),

  // ---------- attributes ----------
  listAttributes: (kind: AttributeKind) => http.get<AttributeOut[]>(`/attributes/${kind}`),
  createAttribute: (kind: AttributeKind, body: AttributeCreate) =>
    http.post<AttributeOut>(`/admin/attributes/${kind}`, body),
  updateAttribute: (kind: AttributeKind, id: string, body: AttributeUpdate) =>
    http.patch<AttributeOut>(`/admin/attributes/${kind}/${id}`, body),
  deleteAttribute: (kind: AttributeKind, id: string) =>
    http.delete<void>(`/admin/attributes/${kind}/${id}`),

  // ---------- products ----------
  searchProducts: (params: ProductListParams = {}) => USE_MOCK_CATALOG
    ? mockCatalogApi.searchProducts(params)
    : http.get<ProductPageOut>("/products/search", {
      params,
      // FastAPI parses repeated keys (`category_ids=a&category_ids=b`). Axios
      // uses bracketed array keys by default, so make the wire format explicit.
      paramsSerializer: { indexes: null },
    }),
  listProductColors: () => USE_MOCK_CATALOG ? mockCatalogApi.listProductColors() : http.get<string[]>("/products/colors"),
  listProducts: () => listAllProducts("/products"),
  getProductBySlug: (slug: string, color?: string | null) =>
    http.get<ProductOut>(`/products/${slug}`, {
      params: color == null ? undefined : { color },
    }),
  adminListProducts: () => listAllProducts("/admin/products"),
  createProduct: (body: ProductCreate) => http.post<ProductOut>("/admin/products", body),
  updateProduct: (id: string, body: ProductUpdate) =>
    http.patch<ProductOut>(`/admin/products/${id}`, body),
  deleteProduct: (id: string) => http.delete<void>(`/admin/products/${id}`),

  // ---------- variants ----------
  createVariant: (productId: string, body: ProductVariantCreate) =>
    http.post<ProductVariantOut>(`/admin/products/${productId}/variants`, body),
  updateVariant: (id: string, body: ProductVariantUpdate) =>
    http.patch<ProductVariantOut>(`/admin/variants/${id}`, body),
  deleteVariant: (id: string) => http.delete<void>(`/admin/variants/${id}`),

  // ---------- images ----------
  createImage: (productId: string, body: ProductImageCreate) =>
    http.post<ProductImageOut>(`/admin/products/${productId}/images`, body),
  updateImage: (id: string, body: ProductImageUpdate) =>
    http.patch<ProductImageOut>(`/admin/images/${id}`, body),
  deleteImage: (id: string) => http.delete<void>(`/admin/images/${id}`),

  // ---------- variant images ----------
  createVariantImage: (variantId: string, body: VariantImageCreate) =>
    http.post<VariantImageOut>(`/admin/variants/${variantId}/images`, body),
  deleteVariantImage: (id: string) => http.delete<void>(`/admin/variant-images/${id}`),

  // ---------- volume discounts ----------
  replaceVolumeDiscounts: (variantId: string, body: VolumeDiscountCreate[]) =>
    http.put<VolumeDiscountOut[]>(`/admin/variants/${variantId}/volume-discounts`, body),
};
