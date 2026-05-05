import { http } from "./client";
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
  ProductUpdate,
  ProductVariantCreate,
  ProductVariantOut,
  ProductVariantUpdate,
  VariantImageCreate,
  VariantImageOut,
  VolumeDiscountCreate,
  VolumeDiscountOut,
} from "./types";

export const catalogApi = {
  // ---------- categories ----------
  listCategories: () => http.get<CategoryOut[]>("/categories"),
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
  listProducts: () => http.get<ProductOut[]>("/products"),
  getProductBySlug: (slug: string) => http.get<ProductOut>(`/products/${slug}`),
  adminListProducts: () => http.get<ProductOut[]>("/admin/products"),
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
