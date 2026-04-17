import type { Currency, Lang } from "@/lib/format";
import type {
  AttributeOut,
  CategoryOut,
  DiscountTierOut,
  ProductImageOut,
  ProductOut,
  ProductVariantOut,
} from "@/lib/api";

// Re-exports so existing pages keep using the short type names while the
// canonical definitions live in `@/lib/api`.
export type Category = CategoryOut;
export type Product = ProductOut;
export type ProductVariant = ProductVariantOut;
export type ProductImage = ProductImageOut;
export type Material = AttributeOut;
export type Scent = AttributeOut;
export type Shape = AttributeOut;
export type DiscountTier = Pick<DiscountTierOut, "min_boxes" | "discount_percent"> & {
  id?: string;
};

export const productName = (p: Pick<Product, "name_ru" | "name_en">, lang: Lang) =>
  lang === "ru" ? p.name_ru : p.name_en;

export const variantPrice = (v: ProductVariant, currency: Currency) =>
  currency === "RUB" ? Number(v.price_per_piece_rub) : Number(v.price_per_piece_usd);

export const variantBoxPrice = (v: ProductVariant, currency: Currency) =>
  variantPrice(v, currency) * v.pieces_per_box;

export const variantLabel = (v: ProductVariant) =>
  [v.size, v.color, v.shape].filter(Boolean).join(" · ");

export const computeDiscount = (totalBoxes: number, tiers: DiscountTier[]) => {
  let percent = 0;
  for (const t of tiers) {
    if (totalBoxes >= t.min_boxes && t.discount_percent > percent) {
      percent = t.discount_percent;
    }
  }
  return percent;
};

export const nextDiscountTier = (totalBoxes: number, tiers: DiscountTier[]) => {
  const upcoming = tiers
    .filter((t) => t.min_boxes > totalBoxes)
    .sort((a, b) => a.min_boxes - b.min_boxes);
  return upcoming[0] ?? null;
};

export const availableBoxes = (v: ProductVariant) =>
  Math.max(0, (v.stock_boxes ?? 0) - (v.reserved_boxes ?? 0));

export const productMinBoxPrice = (p: Product, currency: Currency): number => {
  const prices = (p.variants ?? []).map((v) => variantBoxPrice(v, currency));
  return prices.length ? Math.min(...prices) : 0;
};

export const productTotalStock = (p: Product): number =>
  (p.variants ?? []).reduce((s, v) => s + availableBoxes(v), 0);

export const productGalleryUrls = (p: Product): string[] => {
  const gallery = (p.images ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => i.url);
  if (gallery.length) return gallery;
  return p.image_url ? [p.image_url] : [];
};
