import { describe, it, expect } from "vitest";
import {
  computeDiscount,
  computeLineVolumeDiscount,
  availableBoxes,
  productMinBoxPrice,
  nextDiscountTier,
  variantLabel,
} from "@/lib/catalog";

describe("computeDiscount (global tiers)", () => {
  const tiers = [
    { min_boxes: 10, discount_percent: 5 },
    { min_boxes: 20, discount_percent: 10 },
    { min_boxes: 50, discount_percent: 15 },
  ];

  it("returns 0 when totalBoxes is below all tiers", () => {
    expect(computeDiscount(5, tiers)).toBe(0);
  });

  it("returns the correct tier for exact boundary", () => {
    expect(computeDiscount(10, tiers)).toBe(5);
    expect(computeDiscount(20, tiers)).toBe(10);
    expect(computeDiscount(50, tiers)).toBe(15);
  });

  it("returns the best matching tier for values between boundaries", () => {
    expect(computeDiscount(15, tiers)).toBe(5);
    expect(computeDiscount(35, tiers)).toBe(10);
    expect(computeDiscount(100, tiers)).toBe(15);
  });

  it("returns 0 for empty tiers", () => {
    expect(computeDiscount(100, [])).toBe(0);
  });

  it("returns 0 for zero boxes", () => {
    expect(computeDiscount(0, tiers)).toBe(0);
  });

  it("handles unsorted tiers correctly", () => {
    const unsorted = [
      { min_boxes: 50, discount_percent: 15 },
      { min_boxes: 10, discount_percent: 5 },
      { min_boxes: 20, discount_percent: 10 },
    ];
    expect(computeDiscount(25, unsorted)).toBe(10);
  });
});

describe("computeLineVolumeDiscount (per-variant)", () => {
  const vds = [
    { min_boxes: 5, discount_percent: 3 },
    { min_boxes: 10, discount_percent: 7 },
    { min_boxes: 25, discount_percent: 12 },
  ];

  it("returns 0 for undefined/empty volumeDiscounts", () => {
    expect(computeLineVolumeDiscount(10, undefined)).toBe(0);
    expect(computeLineVolumeDiscount(10, [])).toBe(0);
  });

  it("returns best matching discount for boxes", () => {
    expect(computeLineVolumeDiscount(3, vds)).toBe(0);
    expect(computeLineVolumeDiscount(5, vds)).toBe(3);
    expect(computeLineVolumeDiscount(10, vds)).toBe(7);
    expect(computeLineVolumeDiscount(25, vds)).toBe(12);
    expect(computeLineVolumeDiscount(100, vds)).toBe(12);
  });
});

describe("availableBoxes", () => {
  it("returns stock minus reserved", () => {
    expect(availableBoxes({ stock_boxes: 50, reserved_boxes: 10 })).toBe(40);
  });

  it("returns 0 when reserved >= stock", () => {
    expect(availableBoxes({ stock_boxes: 5, reserved_boxes: 5 })).toBe(0);
    expect(availableBoxes({ stock_boxes: 3, reserved_boxes: 10 })).toBe(0);
  });

  it("handles nullish values", () => {
    expect(availableBoxes({ stock_boxes: null, reserved_boxes: null })).toBe(0);
    expect(availableBoxes({ stock_boxes: undefined, reserved_boxes: undefined })).toBe(0);
  });
});

describe("nextDiscountTier", () => {
  const tiers = [
    { min_boxes: 10, discount_percent: 5 },
    { min_boxes: 20, discount_percent: 10 },
    { min_boxes: 50, discount_percent: 15 },
  ];

  it("returns the next tier above current totalBoxes", () => {
    expect(nextDiscountTier(5, tiers)).toEqual({ min_boxes: 10, discount_percent: 5 });
    expect(nextDiscountTier(10, tiers)).toEqual({ min_boxes: 20, discount_percent: 10 });
    expect(nextDiscountTier(25, tiers)).toEqual({ min_boxes: 50, discount_percent: 15 });
  });

  it("returns null when at or above the highest tier", () => {
    expect(nextDiscountTier(50, tiers)).toBeNull();
    expect(nextDiscountTier(100, tiers)).toBeNull();
  });

  it("returns null for empty tiers", () => {
    expect(nextDiscountTier(5, [])).toBeNull();
  });
});

describe("variantLabel", () => {
  it("joins size, color, shape with separator", () => {
    expect(variantLabel({ size: "Large", color: "Red", shape: "Pillar" })).toBe(
      "Large · Red · Pillar",
    );
  });

  it("skips null/undefined fields", () => {
    expect(variantLabel({ size: null, color: "Blue", shape: null })).toBe("Blue");
  });

  it("returns empty string when all fields are empty", () => {
    expect(variantLabel({ size: null, color: null, shape: null })).toBe("");
  });
});

describe("productMinBoxPrice", () => {
  it("returns the minimum box price across variants", () => {
    const p = {
      variants: [
        { pieces_per_box: 10, price_per_piece_rub: 15, price_per_piece_usd: 0.2 },
        { pieces_per_box: 100, price_per_piece_rub: 12, price_per_piece_usd: 0.15 },
      ],
    };
    // 10*15=150, 100*12=1200 → min=150
    expect(productMinBoxPrice(p, "RUB")).toBe(150);
    // 10*0.2=2, 100*0.15=15 → min=2
    expect(productMinBoxPrice(p, "USD")).toBe(2);
  });

  it("returns 0 for empty variants", () => {
    expect(productMinBoxPrice({ variants: [] }, "RUB")).toBe(0);
    expect(productMinBoxPrice({ variants: undefined }, "RUB")).toBe(0);
  });
});
