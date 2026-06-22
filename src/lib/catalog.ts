import type { Currency, Lang } from "@/lib/format";
import type {
  AttributeOut,
  CategoryOut,
  DiscountTierOut,
  ProductImageOut,
  ProductOut,
  ProductVariantOut,
} from "@/lib/api";
import type { CartVolumeDiscount } from "@/store/cartStore";

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
type PricedVariant = Pick<
  ProductVariant,
  "pieces_per_box" | "price_per_piece_rub" | "price_per_piece_usd"
>;
type VariantLabelFields = {
  size?: string | null;
  color?: string | null;
  shape?: string | null;
};
type VariantStock = {
  stock_boxes?: number | null;
  reserved_boxes?: number | null;
};

export const productName = (p: Pick<Product, "name_ru" | "name_en">, lang: Lang) =>
  lang === "ru" ? p.name_ru : p.name_en;

export const variantPrice = (v: PricedVariant, currency: Currency) =>
  currency === "RUB" ? Number(v.price_per_piece_rub) : Number(v.price_per_piece_usd);

export const variantBoxPrice = (v: PricedVariant, currency: Currency) =>
  variantPrice(v, currency) * v.pieces_per_box;

export const variantLabel = (v: VariantLabelFields) =>
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

export const computeLineVolumeDiscount = (
  boxes: number,
  volumeDiscounts: CartVolumeDiscount[] | undefined,
): number => {
  if (!volumeDiscounts?.length) return 0;
  let best = 0;
  for (const vd of volumeDiscounts) {
    if (boxes >= vd.min_boxes && vd.discount_percent > best) {
      best = vd.discount_percent;
    }
  }
  return best;
};

export const nextDiscountTier = (totalBoxes: number, tiers: DiscountTier[]) => {
  const upcoming = tiers
    .filter((t) => t.min_boxes > totalBoxes)
    .sort((a, b) => a.min_boxes - b.min_boxes);
  return upcoming[0] ?? null;
};

export const availableBoxes = (v: VariantStock) =>
  Math.max(0, (v.stock_boxes ?? 0) - (v.reserved_boxes ?? 0));

export const productMinBoxPrice = (
  p: { variants?: PricedVariant[] | null },
  currency: Currency,
): number => {
  const prices = (p.variants ?? []).map((v) => variantBoxPrice(v, currency));
  return prices.length ? Math.min(...prices) : 0;
};

export const productTotalStock = (p: Product): number =>
  (p.variants ?? []).reduce((s, v) => s + availableBoxes(v), 0);

/**
 * Возвращает все URL-ы товара в порядке, в котором их надо показывать.
 *
 * Приоритет:
 *   1) `image_url` (основное фото) — всегда первое, если задано;
 *   2) галерея из `images`, отсортированная по `sort_order`, без дубля
 *      основного фото.
 *
 * Раньше функция возвращала только галерею, когда она не пуста, из-за
 * чего cover в каталоге и QuickOrder подтягивался из галереи и игнорировал
 * основное фото из поля «Изображение товара».
 */
export const productGalleryUrls = (p: Product): string[] => {
  const gallery = (p.images ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => i.url);
  const main = p.image_url ?? null;
  if (main) return [main, ...gallery.filter((u) => u !== main)];
  return gallery;
};

/**
 * Возвращает галерею для конкретной вариации.
 * Приоритет: variant.images → variant.image_url (legacy) → product gallery.
 * Если у вариации есть своя галерея — показываем только её.
 */
export const variantGalleryUrls = (p: Product, v: ProductVariant | undefined): string[] => {
  const vImages = (v?.images ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => i.url);
  if (vImages.length > 0) return vImages;
  const vImg = v?.image_url ?? null;
  const base = productGalleryUrls(p);
  if (!vImg) return base;
  return [vImg, ...base.filter((u) => u !== vImg)];
};

/**
 * Возвращает URL обложки вариации (первое фото).
 */
export const variantCoverUrl = (p: Product, v: ProductVariant): string | null => {
  const urls = variantGalleryUrls(p, v);
  return urls[0] ?? null;
};
