import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/store/appStore";
import { useCartStore } from "@/store/cartStore";
import {
  productName,
  variantBoxPrice,
  variantLabel,
  variantPrice,
  type DiscountTier,
  type Product,
  type ProductVariant,
} from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { getProductImage } from "@/lib/productImages";
import StockIndicator from "@/components/shop/StockIndicator";
import NumberStepper from "@/components/shop/NumberStepper";
import { toast } from "sonner";

const ProductPage = () => {
  const { slug } = useParams();
  const { currency, lang } = useAppStore();
  const addItem = useCartStore((s) => s.addItem);
  const [product, setProduct] = useState<Product | null>(null);
  const [tiers, setTiers] = useState<DiscountTier[]>([]);
  const [variantId, setVariantId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    Promise.all([
      supabase.from("products")
        .select("*, variants:product_variants(*), category:categories(slug,name_ru,name_en)")
        .eq("slug", slug).maybeSingle(),
      supabase.from("discount_tiers").select("*").order("min_boxes"),
    ]).then(([{ data: p }, { data: t }]) => {
      const product = p as unknown as Product | null;
      setProduct(product);
      setTiers((t as DiscountTier[]) ?? []);
      const first = product?.variants?.find((v) => v.stock_boxes > 0) ?? product?.variants?.[0];
      if (first) setVariantId(first.id);
      setLoading(false);
    });
  }, [slug]);

  if (loading) return <PublicLayout><div className="container py-10"><Skeleton className="h-96" /></div></PublicLayout>;
  if (!product) return <PublicLayout><div className="container py-20 text-center text-muted-foreground">Товар не найден</div></PublicLayout>;

  const variant: ProductVariant | undefined = product.variants?.find((v) => v.id === variantId) ?? product.variants?.[0];

  const sizes = Array.from(new Set(product.variants?.map((v) => v.size).filter(Boolean) as string[]));
  const colors = Array.from(new Set(product.variants?.map((v) => v.color).filter(Boolean) as string[]));

  const handleAdd = () => {
    if (!variant) return;
    addItem({
      variantId: variant.id,
      productId: product.id,
      sku: variant.sku,
      productName: productName(product, lang),
      variantLabel: variantLabel(variant),
      image: product.image_url,
      piecesPerBox: variant.pieces_per_box,
      priceRub: Number(variant.price_per_piece_rub),
      priceUsd: Number(variant.price_per_piece_usd),
      stockBoxes: variant.stock_boxes,
    }, qty);
    toast.success(`${variant.sku} · ${qty} кор. в корзине`);
  };

  return (
    <PublicLayout>
      <div className="container py-6">
        <Link to={product.category ? `/catalog/${product.category.slug}` : "/catalog"} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Назад в каталог
        </Link>
      </div>
      <div className="container grid gap-10 pb-16 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <img src={getProductImage(product.image_url)} alt={productName(product, lang)} className="aspect-square w-full object-cover" />
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="eyebrow">{product.category?.name_ru}</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{productName(product, lang)}</h1>
          {variant && <p className="mt-2 num text-xs text-muted-foreground">Артикул {variant.sku}</p>}

          {(product.description_ru || product.description_en) && (
            <p className="mt-4 text-sm text-foreground/80">
              {lang === "ru" ? product.description_ru : product.description_en}
            </p>
          )}

          {sizes.length > 1 && (
            <div className="mt-6">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Размер</div>
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
                      className={`rounded-md border px-3 py-1.5 text-sm ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}
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
                      className={`rounded-md border px-3 py-1.5 text-sm ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}
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
                <StockIndicator stockBoxes={variant.stock_boxes} />
                <div className="text-right">
                  <div className="price text-2xl">{formatMoney(variantBoxPrice(variant, currency), currency)}</div>
                  <div className="text-xs text-muted-foreground">{formatMoney(variantPrice(variant, currency), currency)} × {variant.pieces_per_box} шт / коробка</div>
                </div>
              </div>

              {tiers.length > 0 && (
                <div className="mt-6 rounded-lg border border-border bg-surface p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Сетка скидок по объёму</div>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {tiers.map((t) => (
                      <div key={t.min_boxes} className="rounded-md border border-border bg-background p-2 text-center">
                        <div className="num text-xs text-muted-foreground">от {t.min_boxes} кор</div>
                        <div className="price text-base text-primary">−{t.discount_percent}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-end gap-3">
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Количество коробок</div>
                  <NumberStepper value={qty} onChange={setQty} min={1} max={variant.stock_boxes || 1} />
                </div>
                <div className="flex flex-1 gap-2">
                  <Button size="lg" disabled={variant.stock_boxes <= 0} onClick={handleAdd} className="flex-1">
                    Добавить в корзину
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[5, 10, 25].map((n) => (
                  <button key={n} onClick={() => setQty(Math.min(n, variant.stock_boxes || 1))}
                    className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent">+{n} кор</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </PublicLayout>
  );
};

export default ProductPage;
