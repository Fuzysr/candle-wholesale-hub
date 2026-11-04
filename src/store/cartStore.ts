import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartVolumeDiscount = {
  min_boxes: number;
  discount_percent: number;
};

export type CartItem = {
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  variantLabel: string;
  image: string | null;
  piecesPerBox: number;
  priceRub: number;
  priceUsd: number;
  stockBoxes: number;
  boxes: number;
  volumeDiscounts?: CartVolumeDiscount[];
};

/** Request mode intentionally allows quantities above the current warehouse snapshot. */
export const MAX_REQUEST_BOXES = 9999;

type CartState = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "boxes">, boxes?: number) => void;
  setBoxes: (variantId: string, boxes: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  totalBoxes: () => number;
  /** Patch volumeDiscounts for items already in cart (e.g. after fresh API data). */
  syncDiscounts: (map: Record<string, CartVolumeDiscount[]>) => void;
  /** Sync stock + discounts from API. Variants missing from API get stockBoxes=0. */
  syncFromApi: (available: Record<string, { stockBoxes: number; discounts: CartVolumeDiscount[] }>) => void;
  /**
   * Восстановить позицию к указанному количеству коробок (для undo после
   * случайного добавления). Если `prevBoxes <= 0` — позиция удаляется
   * полностью. В отличие от setBoxes, разрешает значения вне диапазона
   * [1, stockBoxes] (нужно для отката новой позиции в "не существует").
   */
  restoreItem: (variantId: string, prevBoxes: number) => void;
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item, boxes = 1) => {
        const requested = Math.max(1, Math.min(MAX_REQUEST_BOXES, Math.floor(boxes) || 1));
        const existing = get().items.find((i) => i.variantId === item.variantId);
        if (existing) {
          const next = Math.min(existing.boxes + requested, MAX_REQUEST_BOXES);
          set({
            items: get().items.map((i) =>
              i.variantId === item.variantId ? { ...i, boxes: next } : i,
            ),
          });
        } else {
          set({ items: [...get().items, { ...item, boxes: requested }] });
        }
      },
      setBoxes: (variantId, boxes) => {
        set({
          items: get()
            .items.map((i) =>
              i.variantId === variantId
                ? { ...i, boxes: Math.max(1, Math.min(MAX_REQUEST_BOXES, Math.floor(boxes) || 1)) }
                : i,
            )
            .filter((i) => i.boxes > 0),
        });
      },
      remove: (variantId) =>
        set({ items: get().items.filter((i) => i.variantId !== variantId) }),
      clear: () => set({ items: [] }),
      totalBoxes: () => get().items.reduce((s, i) => s + i.boxes, 0),
      syncDiscounts: (map) =>
        set({
          items: get().items.map((i) =>
            map[i.variantId] ? { ...i, volumeDiscounts: map[i.variantId] } : i,
          ),
        }),
      syncFromApi: (available) =>
        set({
          items: get().items.map((i) => {
            const fresh = available[i.variantId];
            if (!fresh) return { ...i, stockBoxes: 0 };
            return {
              ...i,
              stockBoxes: fresh.stockBoxes,
              volumeDiscounts: fresh.discounts,
            };
          }),
        }),
      restoreItem: (variantId, prevBoxes) => {
        if (prevBoxes <= 0) {
          set({ items: get().items.filter((i) => i.variantId !== variantId) });
        } else {
          set({
            items: get().items.map((i) =>
              i.variantId === variantId ? { ...i, boxes: prevBoxes } : i,
            ),
          });
        }
      },
    }),
    { name: "wc-cart" },
  ),
);
