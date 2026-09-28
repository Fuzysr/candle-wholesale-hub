import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogApi } from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import { useCartStore } from "@/store/cartStore";
import {
  productName,
  productGalleryUrls,
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
import { clearCatalogRestoreState } from "@/features/catalog-restore";
import { toast } from "sonner";
import AddToCartConfirm from "@/components/shop/AddToCartConfirm";

const ProductPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlVariantId = searchParams.get("variant");
  const urlColor = searchParams.get("color");
  const { currency, lang } = useAppStore();
  const addItem = useCartStore((s) => s.addItem);
  const { push } = useRecentlyViewed();
  const [variantId, setVariantId] = useState<string>(urlVariantId ?? "");
  const [qty, setQty] = useState(1);
  const [showConfirm, setShowConfirm] = useState(false);

  const productQuery = useQuery({
    queryKey: ["product", slug, urlColor],
    queryFn: () => catalogApi.getProductBySlug(slug!, urlColor),
    enabled: !!slug,
    retry: (_count, err) => !(axios.isAxiosError(err) && err.response?.status === 404),
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
            <Skeleton className="aspect-[3/4] w-full rounded-lg" />
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

  const stock = variant ? availableBoxes(variant) : 0;

  // A color card owns one shared gallery. Keep the legacy variant fallback so
  // older records without product-level photos still render correctly.
  const sharedGallery = productGalleryUrls(product);
  const colorGallery = variantGalleryUrls(product, product.variants?.[0]);
  const gallery = colorGallery.length ? colorGallery : sharedGallery;

  const handleAdd = () => {
    if (!variant) return;
    setShowConfirm(true);
  };

  const executeAdd = () => {
    if (!variant) return;
    addItem({
      variantId: variant.id,
      productId: product.id,
      sku: variant.sku,
      productName: productName(product, lang),
      variantLabel: variantLabel(variant),
      image: gallery[0] ?? null,
      piecesPerBox: variant.pieces_per_box,
      priceRub: Number(variant.price_per_piece_rub),
      priceUsd: Number(variant.price_per_piece_usd),
      stockBoxes: stock,
      volumeDiscounts: (variant.volume_discounts ?? []).map((vd) => ({
        min_boxes: vd.min_boxes,
        discount_percent: vd.discount_percent,
      })),
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
        <button
          type="button"
          onClick={() => {
            clearCatalogRestoreState();
            navigate("/catalog");
          }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Назад в каталог
        </button>
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

          {variant && (() => {
            const specs: { label: string; value: string }[] = [];
            if (variant.length_mm) specs.push({ label: "Длина", value: `${variant.length_mm} мм` });
            if (variant.width_mm) specs.push({ label: "Диаметр", value: `${variant.width_mm} мм` });
            if (variant.height_mm) specs.push({ label: "Высота", value: `${variant.height_mm} мм` });
            if (variant.weight_gr) specs.push({ label: "Вес", value: `${variant.weight_gr} г` });
            if (variant.burn_time_hours) specs.push({ label: "Время горения", value: `${variant.burn_time_hours} ч` });
            specs.push({ label: "Шт. в коробке", value: `${variant.pieces_per_box}` });
            if (variant.packages_per_box) specs.push({ label: "Упаковок в ТК", value: `${variant.packages_per_box}` });
            if (variant.box_length_mm && variant.box_width_mm && variant.box_height_mm)
              specs.push({ label: "Габариты ТК", value: `${variant.box_length_mm}×${variant.box_width_mm}×${variant.box_height_mm} мм` });
            if (variant.box_weight_gr) specs.push({ label: "Вес ТК", value: `${(variant.box_weight_gr / 1000).toFixed(2)} кг` });
            return specs.length > 1 ? (
              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Характеристики</div>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-md border border-border bg-surface p-3 text-sm sm:grid-cols-2">
                  {specs.map((s) => (
                    <div key={s.label} className="flex justify-between gap-2 border-b border-border/50 pb-1.5 last:border-0">
                      <dt className="text-muted-foreground">{s.label}</dt>
                      <dd className="num font-medium">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null;
          })()}

          {product.variants?.length > 1 && (
            <div className="mt-6">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Размер</div>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => {
                  const active = v.id === variant?.id;
                  const label = v.size || v.sku;
                  return (
                    <button
                      key={v.id}
                      onClick={() => { setVariantId(v.id); setQty(1); }}
                      className={`min-h-[44px] rounded-md border px-3 py-1.5 text-sm transition-colors ${active ? "border-primary bg-primary/15 font-medium text-primary" : "border-border hover:bg-accent"}`}
                    >
                      {label}
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

              {variant.volume_discounts?.length > 0 && (
                <div className="mt-6 rounded-lg border border-border bg-surface p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Скидки по объёму</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {variant.volume_discounts.map((vd) => (
                      <div key={vd.id} className="rounded-md border border-amber/30 bg-amber/5 p-2 text-center">
                        <div className="num text-xs text-muted-foreground">от {vd.min_boxes} кор</div>
                        <div className="price text-base text-amber">−{vd.discount_percent}%</div>
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
                <Button size="lg" disabled={stock <= 0} onClick={handleAdd} className="w-full sm:flex-1">
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

      <AddToCartConfirm
        open={showConfirm}
        title="Добавить в корзину?"
        description={variant ? `${variant.sku} · ${variantLabel(variant)} — ${qty} кор.` : undefined}
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          executeAdd();
        }}
      />
    </PublicLayout>
  );
};

export default ProductPage;
