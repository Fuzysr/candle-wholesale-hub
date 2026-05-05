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
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item, boxes = 1) => {
        if (item.stockBoxes <= 0) return;
        const existing = get().items.find((i) => i.variantId === item.variantId);
        if (existing) {
          const next = Math.min(existing.boxes + boxes, item.stockBoxes);
          if (next <= 0) return;
          set({
            items: get().items.map((i) =>
              i.variantId === item.variantId ? { ...i, boxes: next } : i,
            ),
          });
        } else {
          const safe = Math.min(boxes, item.stockBoxes);
          if (safe <= 0) return;
          set({ items: [...get().items, { ...item, boxes: safe }] });
        }
      },
      setBoxes: (variantId, boxes) => {
        set({
          items: get()
            .items.map((i) =>
              i.variantId === variantId
                ? { ...i, boxes: Math.max(1, Math.min(boxes, i.stockBoxes)) }
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
            if (!fresh) return { ...i, stockBoxes: 0, boxes: 0 };
            const clamped = Math.min(i.boxes, fresh.stockBoxes);
            return {
              ...i,
              stockBoxes: fresh.stockBoxes,
              volumeDiscounts: fresh.discounts,
              boxes: Math.max(clamped, fresh.stockBoxes > 0 ? 1 : 0),
            };
          }),
        }),
    }),
    { name: "wc-cart" },
  ),
);
