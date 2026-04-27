import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogApi, stockApi } from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import { useCartStore } from "@/store/cartStore";
import {
  productName,
  variantGalleryUrls,
  variantBoxPrice,
  variantLabel,
  variantPrice,
  availableBoxes,
  type ProductVariant,
} from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import StockIndicator from "@/components/shop/StockIndicator";
import NumberStepper from "@/components/shop/NumberStepper";
import ProductGallery from "@/components/shop/ProductGallery";
import RecentlyViewed from "@/components/shop/RecentlyViewed";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { toast } from "sonner";

const ProductPage = () => {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const urlVariantId = searchParams.get("variant");
  const { currency, lang } = useAppStore();
  const addItem = useCartStore((s) => s.addItem);
  const { push } = useRecentlyViewed();
  const [variantId, setVariantId] = useState<string>(urlVariantId ?? "");
  const [qty, setQty] = useState(1);

  const productQuery = useQuery({
    queryKey: ["product", slug],
    queryFn: () => catalogApi.getProductBySlug(slug!),
    enabled: !!slug,
    retry: (_count, err) => !(axios.isAxiosError(err) && err.response?.status === 404),
  });
  const { data: tiers = [] } = useQuery({
    queryKey: ["discount-tiers"],
    queryFn: () => stockApi.listDiscountTiers(),
  });

  const product = productQuery.data ?? null;

  // Initial variant selection when the product is first loaded.
  // If a ?variant=<id> query param is present, prefer that variant.
  useEffect(() => {
    if (!product) return;
    const fromUrl = urlVariantId ? product.variants.find((v) => v.id === urlVariantId) : null;
    const first = fromUrl ?? product.variants.find((v) => availableBoxes(v) > 0) ?? product.variants[0];
    if (first) setVariantId(first.id);
    push({
      id: product.id,
      slug: product.slug,
      name_ru: product.name_ru,
      name_en: product.name_en,
      image_url: product.image_url,
    });
  }, [product, push, urlVariantId]);

  if (productQuery.isLoading) {
    return (
      <PublicLayout>
        <div className="container py-10">
          <Skeleton className="mb-4 h-4 w-40" />
          <div className="grid gap-8 md:grid-cols-2">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </div>
      </PublicLayout>
    );
  }
  if (!product) {
    return (
      <PublicLayout>
        <div className="container py-20 text-center text-muted-foreground">Товар не найден</div>
      </PublicLayout>
    );
  }

  const variant: ProductVariant | undefined = product.variants?.find((v) => v.id === variantId) ?? product.variants?.[0];

  const sizes = Array.from(new Set(product.variants?.map((v) => v.size).filter(Boolean) as string[]));
  const colors = Array.from(new Set(product.variants?.map((v) => v.color).filter(Boolean) as string[]));
  const stock = variant ? availableBoxes(variant) : 0;

  const gallery = variantGalleryUrls(product, variant);

  const handleAdd = () => {
    if (!variant) return;
    addItem({
      variantId: variant.id,
      productId: product.id,
      sku: variant.sku,
      productName: productName(product, lang),
      variantLabel: variantLabel(variant),
      image: gallery[0] ?? product.image_url,
      piecesPerBox: variant.pieces_per_box,
      priceRub: Number(variant.price_per_piece_rub),
      priceUsd: Number(variant.price_per_piece_usd),
      stockBoxes: stock,
    }, qty);
    toast.success(`${variant.sku} · ${qty} кор. в корзине`);
  };

  const attrs = [
    product.material && { label: "Материал", value: lang === "ru" ? product.material.name_ru : product.material.name_en },
    product.scent && { label: "Аромат", value: lang === "ru" ? product.scent.name_ru : product.scent.name_en },
    product.shape && { label: "Форма", value: lang === "ru" ? product.shape.name_ru : product.shape.name_en },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <PublicLayout>
      <div className="container py-6">
        <Link to={product.category ? `/catalog/${product.category.slug}` : "/catalog"} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Назад в каталог
        </Link>
      </div>
      <div className="container grid gap-6 pb-10 sm:gap-10 sm:pb-16 lg:grid-cols-2">
        <ProductGallery images={gallery} alt={productName(product, lang)} />

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="eyebrow">{product.category?.name_ru}</div>
          <h1 className="mt-2 font-semibold tracking-tight text-[clamp(1.5rem,4vw,1.875rem)]">{productName(product, lang)}</h1>
          {variant && <p className="mt-2 num text-xs text-muted-foreground">Артикул {variant.sku}</p>}

          {(product.description_ru || product.description_en) && (
            <p className="mt-4 text-sm text-foreground/80">
              {lang === "ru" ? product.description_ru : product.description_en}
            </p>
          )}

          {attrs.length > 0 && (
            <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 rounded-md border border-border bg-surface p-3 text-sm sm:grid-cols-2">
              {attrs.map((a) => (
                <div key={a.label} className="flex justify-between gap-2 border-b border-border/50 pb-1.5 last:border-0">
                  <dt className="text-muted-foreground">{a.label}</dt>
                  <dd className="font-medium">{a.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {sizes.length > 1 && (
            <div className="mt-6">
              <div className="mb-2 text-xs text-muted-foreground">Размер</div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => {
                  const active = variant?.size === s;
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        const next = product.variants?.find((v) => v.size === s && (variant ? v.color === variant.color : true)) ?? product.variants?.find((v) => v.size === s);
                        if (next) { setVariantId(next.id); setQty(1); }
                      }}
                      className={`min-h-[44px] rounded-md border px-3 py-1.5 text-sm ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {colors.length > 1 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Цвет</div>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => {
                  const active = variant?.color === c;
                  return (
                    <button
                      key={c}
                      onClick={() => {
                        const next = product.variants?.find((v) => v.color === c && (variant ? v.size === variant.size : true)) ?? product.variants?.find((v) => v.color === c);
                        if (next) { setVariantId(next.id); setQty(1); }
                      }}
                      className={`min-h-[44px] rounded-md border px-3 py-1.5 text-sm ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {variant && (
            <>
              <div className="mt-6 flex items-baseline justify-between">
                <StockIndicator stockBoxes={stock} />
                <div className="text-right">
                  <div className="price text-2xl">{formatMoney(variantBoxPrice(variant, currency), currency)}</div>
                  <div className="text-xs text-muted-foreground">{formatMoney(variantPrice(variant, currency), currency)} × {variant.pieces_per_box} шт / коробка</div>
                </div>
              </div>

              {tiers.length > 0 && (
                <div className="mt-6 rounded-lg border border-border bg-surface p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Сетка скидок по объёму</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {tiers.map((t) => (
                      <div key={t.min_boxes} className="rounded-md border border-border bg-background p-2 text-center">
                        <div className="num text-xs text-muted-foreground">от {t.min_boxes} кор</div>
                        <div className="price text-base text-primary">−{t.discount_percent}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Количество коробок</div>
                  <NumberStepper value={qty} onChange={setQty} min={1} max={stock || 1} />
                </div>
                <Button size="lg" disabled={stock <= 0} onClick={handleAdd} className="flex-1">
                  Добавить в корзину
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[5, 10, 25].map((n) => (
                  <button key={n} onClick={() => setQty(Math.min(n, stock || 1))}
                    className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent">+{n} кор</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <RecentlyViewed excludeId={product.id} />
    </PublicLayout>
  );
};

export default ProductPage;
