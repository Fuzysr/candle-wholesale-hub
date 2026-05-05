import { describe, it, expect, beforeEach } from "vitest";
import { useCartStore } from "@/store/cartStore";
import type { CartItem } from "@/store/cartStore";

const makeItem = (overrides: Partial<CartItem> = {}): Omit<CartItem, "boxes"> => ({
  variantId: "v-1",
  productId: "p-1",
  sku: "SKU-1",
  productName: "Test Candle",
  variantLabel: "White",
  image: null,
  piecesPerBox: 100,
  priceRub: 14.5,
  priceUsd: 0.16,
  stockBoxes: 50,
  ...overrides,
});

beforeEach(() => {
  useCartStore.setState({ items: [] });
});

describe("cartStore", () => {
  describe("addItem", () => {
    it("adds a new item with default boxes=1", () => {
      useCartStore.getState().addItem(makeItem());
      const items = useCartStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].boxes).toBe(1);
      expect(items[0].variantId).toBe("v-1");
    });

    it("adds a new item with specified boxes", () => {
      useCartStore.getState().addItem(makeItem(), 5);
      expect(useCartStore.getState().items[0].boxes).toBe(5);
    });

    it("increments boxes for existing variant", () => {
      useCartStore.getState().addItem(makeItem(), 3);
      useCartStore.getState().addItem(makeItem(), 2);
      const items = useCartStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].boxes).toBe(5);
    });

    it("clamps to stockBoxes when adding", () => {
      useCartStore.getState().addItem(makeItem({ stockBoxes: 3 }), 10);
      expect(useCartStore.getState().items[0].boxes).toBe(3);
    });

    it("clamps increment to stockBoxes for existing item", () => {
      useCartStore.getState().addItem(makeItem({ stockBoxes: 5 }), 3);
      useCartStore.getState().addItem(makeItem({ stockBoxes: 5 }), 10);
      expect(useCartStore.getState().items[0].boxes).toBe(5);
    });

    // BUG-8 fix: addItem with stockBoxes=0 should NOT add to cart
    it("does not add item when stockBoxes=0", () => {
      useCartStore.getState().addItem(makeItem({ stockBoxes: 0 }), 5);
      expect(useCartStore.getState().items).toHaveLength(0);
    });

    it("does not add item when stockBoxes is negative", () => {
      useCartStore.getState().addItem(makeItem({ stockBoxes: -1 }), 1);
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });

  describe("setBoxes", () => {
    it("updates boxes for a variant", () => {
      useCartStore.getState().addItem(makeItem(), 1);
      useCartStore.getState().setBoxes("v-1", 10);
      expect(useCartStore.getState().items[0].boxes).toBe(10);
    });

    it("clamps to minimum 1", () => {
      useCartStore.getState().addItem(makeItem(), 5);
      useCartStore.getState().setBoxes("v-1", 0);
      expect(useCartStore.getState().items[0].boxes).toBe(1);
    });

    it("clamps to stockBoxes", () => {
      useCartStore.getState().addItem(makeItem({ stockBoxes: 10 }), 5);
      useCartStore.getState().setBoxes("v-1", 999);
      expect(useCartStore.getState().items[0].boxes).toBe(10);
    });

    it("does nothing for non-existent variant", () => {
      useCartStore.getState().addItem(makeItem(), 5);
      useCartStore.getState().setBoxes("non-existent", 10);
      expect(useCartStore.getState().items).toHaveLength(1);
      expect(useCartStore.getState().items[0].boxes).toBe(5);
    });
  });

  describe("remove", () => {
    it("removes item by variantId", () => {
      useCartStore.getState().addItem(makeItem({ variantId: "v-1" }));
      useCartStore.getState().addItem(makeItem({ variantId: "v-2" }));
      useCartStore.getState().remove("v-1");
      const items = useCartStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].variantId).toBe("v-2");
    });
  });

  describe("clear", () => {
    it("removes all items", () => {
      useCartStore.getState().addItem(makeItem({ variantId: "v-1" }));
      useCartStore.getState().addItem(makeItem({ variantId: "v-2" }));
      useCartStore.getState().clear();
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });

  describe("totalBoxes", () => {
    it("sums boxes across all items", () => {
      useCartStore.getState().addItem(makeItem({ variantId: "v-1" }), 3);
      useCartStore.getState().addItem(makeItem({ variantId: "v-2" }), 7);
      expect(useCartStore.getState().totalBoxes()).toBe(10);
    });

    it("returns 0 for empty cart", () => {
      expect(useCartStore.getState().totalBoxes()).toBe(0);
    });
  });

  describe("syncDiscounts", () => {
    it("patches volumeDiscounts for matching variants", () => {
      useCartStore.getState().addItem(makeItem({ variantId: "v-1" }));
      useCartStore.getState().syncDiscounts({
        "v-1": [{ min_boxes: 5, discount_percent: 10 }],
      });
      expect(useCartStore.getState().items[0].volumeDiscounts).toEqual([
        { min_boxes: 5, discount_percent: 10 },
      ]);
    });

    it("leaves unmatched variants unchanged", () => {
      useCartStore.getState().addItem(makeItem({ variantId: "v-1" }));
      useCartStore.getState().syncDiscounts({
        "v-other": [{ min_boxes: 5, discount_percent: 10 }],
      });
      expect(useCartStore.getState().items[0].volumeDiscounts).toBeUndefined();
    });
  });

  describe("syncFromApi", () => {
    it("updates stockBoxes and discounts from API data", () => {
      useCartStore.getState().addItem(makeItem({ variantId: "v-1", stockBoxes: 50 }), 10);
      useCartStore.getState().syncFromApi({
        "v-1": {
          stockBoxes: 25,
          discounts: [{ min_boxes: 10, discount_percent: 5 }],
        },
      });
      const item = useCartStore.getState().items[0];
      expect(item.stockBoxes).toBe(25);
      expect(item.boxes).toBe(10); // still within new stock
      expect(item.volumeDiscounts).toEqual([{ min_boxes: 10, discount_percent: 5 }]);
    });

    it("clamps boxes when stockBoxes decreases below current boxes", () => {
      useCartStore.getState().addItem(makeItem({ variantId: "v-1", stockBoxes: 50 }), 20);
      useCartStore.getState().syncFromApi({
        "v-1": { stockBoxes: 5, discounts: [] },
      });
      const item = useCartStore.getState().items[0];
      expect(item.stockBoxes).toBe(5);
      expect(item.boxes).toBe(5); // clamped to new stock
    });

    it("sets stockBoxes=0 and boxes=0 for variants missing from API", () => {
      useCartStore.getState().addItem(makeItem({ variantId: "v-1", stockBoxes: 50 }));
      useCartStore.getState().syncFromApi({});
      expect(useCartStore.getState().items[0].stockBoxes).toBe(0);
      expect(useCartStore.getState().items[0].boxes).toBe(0);
    });
  });
});
