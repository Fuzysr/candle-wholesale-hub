import { create } from "zustand";
import { persist } from "zustand/middleware";

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
};

type CartState = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "boxes">, boxes?: number) => void;
  setBoxes: (variantId: string, boxes: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  totalBoxes: () => number;
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item, boxes = 1) => {
        const existing = get().items.find((i) => i.variantId === item.variantId);
        if (existing) {
          const next = Math.min(existing.boxes + boxes, item.stockBoxes);
          set({
            items: get().items.map((i) =>
              i.variantId === item.variantId ? { ...i, boxes: next } : i,
            ),
          });
        } else {
          const safe = Math.min(boxes, item.stockBoxes);
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
    }),
    { name: "wc-cart" },
  ),
);
