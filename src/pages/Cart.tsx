import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, ShoppingBag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/cartStore";
import { useAppStore } from "@/store/appStore";
import { formatMoney } from "@/lib/format";
import { getProductImage } from "@/lib/productImages";
import NumberStepper from "@/components/shop/NumberStepper";
import { computeLineVolumeDiscount } from "@/lib/catalog";
import { catalogApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const Cart = () => {
  const navigate = useNavigate();
  const { items, setBoxes, remove, clear, syncFromApi } = useCartStore();
  const { currency } = useAppStore();

  // Sync stock & discounts from API — unpublished/deleted variants get stockBoxes=0
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => catalogApi.listProducts(),
    staleTime: 60_000,
  });
  useEffect(() => {
    if (!products || items.length === 0) return;
    const available: Record<string, { stockBoxes: number; discounts: { min_boxes: number; discount_percent: number }[] }> = {};
    for (const p of products) {
      for (const v of p.variants ?? []) {
        available[v.id] = {
          stockBoxes: Math.max(0, (v.stock_boxes ?? 0) - (v.reserved_boxes ?? 0)),
          discounts: (v.volume_discounts ?? []).map((vd) => ({
            min_boxes: vd.min_boxes,
            discount_percent: vd.discount_percent,
          })),
        };
      }
    }
    syncFromApi(available);
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    const totalBoxes = items.reduce((s, i) => s + i.boxes, 0);
    let subtotalBefore = 0;
    let subtotalAfter = 0;
    for (const i of items) {
      const price = currency === "RUB" ? i.priceRub : i.priceUsd;
      const line = price * i.piecesPerBox * i.boxes;
      subtotalBefore += line;
      const vdPercent = computeLineVolumeDiscount(i.boxes, i.volumeDiscounts);
      subtotalAfter += vdPercent > 0 ? line * (100 - vdPercent) / 100 : line;
    }
    const discountAmount = subtotalBefore - subtotalAfter;
    return { totalBoxes, subtotal: subtotalBefore, discountAmount, total: subtotalAfter };
  }, [items, currency]);

  // Не даём оформить заявку, если в корзине есть позиции, которых нет на
  // складе или которых меньше, чем заказано. Сервер тоже блокирует это
  // (POST /orders → 409), но кнопку лучше отключить заранее.
  const hasStockIssues = items.some(
    (i) => i.stockBoxes <= 0 || i.boxes > i.stockBoxes,
  );

  // Track whether the main "Оформить заявку" button is visible on screen.
  // When it scrolls out of view, show the mobile sticky bar instead.
  const checkoutBtnRef = useRef<HTMLButtonElement>(null);
  const [checkoutBtnVisible, setCheckoutBtnVisible] = useState(true);

  useEffect(() => {
    const el = checkoutBtnRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCheckoutBtnVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (items.length === 0) {
    return (
      <PublicLayout>
        <div className="container py-16 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-muted">
            <ShoppingBag className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">Корзина пуста</h1>
          <p className="mt-2 text-muted-foreground">Добавьте товары из каталога или используйте быстрый заказ.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild><Link to="/catalog">В каталог</Link></Button>
            <Button asChild variant="outline"><Link to="/quick-order">Быстрый заказ</Link></Button>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="container pb-24 pt-8 md:pb-8">
        <h1 className="font-semibold tracking-tight text-[clamp(1.5rem,4vw,1.875rem)]">Корзина</h1>
        <p className="mt-1 text-sm text-muted-foreground">{items.length} позиц. · {totals.totalBoxes} кор.</p>

        <div className="mt-6 grid gap-6 sm:mt-8 sm:gap-8 lg:grid-cols-[1fr_340px]">
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            {items.map((i) => {
              const price = currency === "RUB" ? i.priceRub : i.priceUsd;
              const lineBefore = price * i.piecesPerBox * i.boxes;
              const vdPercent = computeLineVolumeDiscount(i.boxes, i.volumeDiscounts);
              const lineTotal = vdPercent > 0 ? lineBefore * (100 - vdPercent) / 100 : lineBefore;
              const outOfStock = i.stockBoxes <= 0;
              const overStock = !outOfStock && i.boxes > i.stockBoxes;
              return (
                <div key={i.variantId} className={cn("flex gap-3 border-b border-border p-3 last:border-b-0 sm:gap-4 sm:p-4", outOfStock && "opacity-50 grayscale")}>
                  <img src={getProductImage(i.image)} alt={i.productName} className="h-16 w-16 shrink-0 rounded-md object-cover sm:h-20 sm:w-20" loading="lazy" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="num text-[11px] text-muted-foreground">{i.sku}</div>
                        <div className="font-semibold">{i.productName}</div>
                        <div className="text-xs text-muted-foreground">{i.variantLabel} · {i.piecesPerBox} шт / кор</div>
                      </div>
                      <button onClick={() => remove(i.variantId)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {(outOfStock || overStock) && (
                      <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive">
                        {outOfStock
                          ? "Нет в наличии — удалите позицию, чтобы оформить заявку"
                          : `Доступно только ${i.stockBoxes} кор. — уменьшите количество`}
                      </div>
                    )}
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <NumberStepper value={i.boxes} onChange={(n) => setBoxes(i.variantId, n)} min={1} max={Math.max(1, i.stockBoxes)} />
                      <div className="text-right">
                        {vdPercent > 0 ? (
                          <>
                            <div className="price text-base">{formatMoney(lineTotal, currency)}</div>
                            <div className="text-[11px] text-muted-foreground line-through">{formatMoney(lineBefore, currency)}</div>
                            <div className="text-[11px] font-medium text-amber">−{vdPercent}%</div>
                          </>
                        ) : (
                          <>
                            <div className="price text-base">{formatMoney(lineTotal, currency)}</div>
                            <div className="text-[11px] text-muted-foreground">{formatMoney(price * i.piecesPerBox, currency)} × {i.boxes} кор</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex justify-end p-3">
              <button onClick={clear} className="text-xs text-muted-foreground hover:text-destructive">Очистить корзину</button>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-lg border border-border bg-surface p-5">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Товаров</span><span className="num">{items.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Коробок</span><span className="num">{totals.totalBoxes}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Сумма</span><span className="price">{formatMoney(totals.subtotal, currency)}</span></div>
                {totals.discountAmount > 0 && (
                  <div className="flex justify-between text-amber"><span>Скидка</span><span className="price">−{formatMoney(totals.discountAmount, currency)}</span></div>
                )}
              </div>
              <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
                <span className="font-semibold">Итого</span>
                <span className="price text-2xl">{formatMoney(totals.total, currency)}</span>
              </div>
              <Button
                ref={checkoutBtnRef}
                size="lg"
                className="mt-5 w-full"
                disabled={hasStockIssues}
                onClick={() => navigate("/checkout")}
              >
                Оформить заявку
              </Button>
              {hasStockIssues && (
                <p className="mt-3 text-[11px] text-destructive">
                  Часть позиций недоступна на складе — поправьте корзину, чтобы продолжить.
                </p>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Без онлайн-оплаты. Менеджер пришлёт счёт и реквизиты в течение 2 часов.
              </p>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile sticky checkout bar — only when the main button is scrolled out of view */}
      {!checkoutBtnVisible && (
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.1)] backdrop-blur md:hidden dark:shadow-[0_-4px_16px_rgba(0,0,0,0.3)]">
        <Button
          size="lg"
          className="w-full gap-2"
          disabled={hasStockIssues}
          onClick={() => navigate("/checkout")}
        >
          Оформить заявку
          <span className="ml-1 rounded-md bg-primary-foreground/20 px-2 py-0.5 text-xs">
            {totals.totalBoxes} кор. · {formatMoney(totals.total, currency)}
          </span>
        </Button>
      </div>
      )}
    </PublicLayout>
  );
};

export default Cart;
