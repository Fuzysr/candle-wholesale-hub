import type { Currency, Lang } from "@/lib/format";

export type DiscountTier = { min_boxes: number; discount_percent: number };

export type ProductVariant = {
  id: string;
  product_id: string;
  sku: string;
  size: string | null;
  color: string | null;
  shape: string | null;
  pieces_per_box: number;
  price_per_piece_rub: number;
  price_per_piece_usd: number;
  stock_boxes: number;
};

export type Product = {
  id: string;
  slug: string;
  category_id: string | null;
  name_ru: string;
  name_en: string;
  description_ru: string | null;
  description_en: string | null;
  image_url: string | null;
  is_published: boolean;
  variants?: ProductVariant[];
  category?: { slug: string; name_ru: string; name_en: string } | null;
};

export type Category = {
  id: string;
  slug: string;
  name_ru: string;
  name_en: string;
  sort_order: number;
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
