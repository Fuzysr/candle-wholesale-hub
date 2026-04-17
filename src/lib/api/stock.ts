import { http } from "./client";
import type {
  DiscountTierCreate,
  DiscountTierOut,
  DiscountTierUpdate,
  InventorySyncOut,
  StockOpIn,
  StockVariantOut,
} from "./types";

export const stockApi = {
  // ---------- discount tiers (public read + admin write) ----------
  listDiscountTiers: () => http.get<DiscountTierOut[]>("/discount-tiers"),
  createDiscountTier: (body: DiscountTierCreate) =>
    http.post<DiscountTierOut>("/admin/discount-tiers", body),
  updateDiscountTier: (id: string, body: DiscountTierUpdate) =>
    http.patch<DiscountTierOut>(`/admin/discount-tiers/${id}`, body),
  deleteDiscountTier: (id: string) => http.delete<void>(`/admin/discount-tiers/${id}`),

  // ---------- admin stock view + movements ----------
  adminList: () => http.get<StockVariantOut[]>("/admin/stock"),
  adminMovement: (body: StockOpIn) => http.post<StockVariantOut>("/admin/stock/movements", body),

  // ---------- outbound inventory snapshot ----------
  inventorySync: () => http.get<InventorySyncOut>("/inventory/sync"),
};
