import { useMemo } from "react";
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
import DiscountProgressBar from "@/components/shop/DiscountProgressBar";
import { stockApi } from "@/lib/api";
import { computeDiscount } from "@/lib/catalog";

const Cart = () => {
  const navigate = useNavigate();
  const { items, setBoxes, remove, clear } = useCartStore();
  const { currency } = useAppStore();
  const { data: tiers = [] } = useQuery({
    queryKey: ["discount-tiers"],
    queryFn: () => stockApi.listDiscountTiers(),
  });

  const totals = useMemo(() => {
    const totalBoxes = items.reduce((s, i) => s + i.boxes, 0);
    const subtotal = items.reduce((s, i) => {
      const price = currency === "RUB" ? i.priceRub : i.priceUsd;
      return s + price * i.piecesPerBox * i.boxes;
    }, 0);
    const discountPercent = computeDiscount(totalBoxes, tiers);
    const discountAmount = (subtotal * discountPercent) / 100;
    return { totalBoxes, subtotal, discountPercent, discountAmount, total: subtotal - discountAmount };
  }, [items, currency, tiers]);

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
      <div className="container py-8">
        <h1 className="text-3xl font-semibold tracking-tight">Корзина</h1>
        <p className="mt-1 text-sm text-muted-foreground">{items.length} позиц. · {totals.totalBoxes} кор.</p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            {items.map((i) => {
              const price = currency === "RUB" ? i.priceRub : i.priceUsd;
              const lineTotal = price * i.piecesPerBox * i.boxes;
              return (
                <div key={i.variantId} className="flex gap-4 border-b border-border p-4 last:border-b-0">
                  <img src={getProductImage(i.image)} alt={i.productName} className="h-20 w-20 rounded-md object-cover" loading="lazy" />
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
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <NumberStepper value={i.boxes} onChange={(n) => setBoxes(i.variantId, n)} min={1} max={i.stockBoxes} />
                      <div className="text-right">
                        <div className="price text-base">{formatMoney(lineTotal, currency)}</div>
                        <div className="text-[11px] text-muted-foreground">{formatMoney(price * i.piecesPerBox, currency)} × {i.boxes} кор</div>
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
            <DiscountProgressBar totalBoxes={totals.totalBoxes} tiers={tiers} />

            <div className="rounded-lg border border-border bg-surface p-5">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Товаров</span><span className="num">{items.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Коробок</span><span className="num">{totals.totalBoxes}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Сумма</span><span className="price">{formatMoney(totals.subtotal, currency)}</span></div>
                {totals.discountPercent > 0 && (
                  <div className="flex justify-between text-primary"><span>Скидка {totals.discountPercent}%</span><span className="price">−{formatMoney(totals.discountAmount, currency)}</span></div>
                )}
              </div>
              <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
                <span className="font-semibold">Итого</span>
                <span className="price text-2xl">{formatMoney(totals.total, currency)}</span>
              </div>
              <Button size="lg" className="mt-5 w-full" onClick={() => navigate("/checkout")}>
                Оформить заявку
              </Button>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Без онлайн-оплаты. Менеджер пришлёт счёт и реквизиты в течение 2 часов.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </PublicLayout>
  );
};

export default Cart;
