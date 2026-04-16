import { Link } from "react-router-dom";
import { Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const QuickOrderTeaser = () => {
  return (
    <section className="container py-16 md:py-20">
      <div className="grid items-center gap-8 rounded-xl border border-border bg-foreground p-8 text-background md:grid-cols-2 md:p-12">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
            <Zap className="h-3.5 w-3.5" /> Для опытных закупщиков
          </div>
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Знаете артикулы? Соберите заявку <span className="text-primary">за минуту</span>.
          </h2>
          <p className="mt-3 max-w-md text-sm text-background/70 md:text-base">
            Таблица с автокомплитом, импорт из Excel, повторение прошлой заявки в один клик.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2 bg-primary text-primary-foreground hover:bg-primary-hover">
              <Link to="/quick-order">
                Открыть быстрый заказ <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="text-background hover:bg-background/10 hover:text-background"
            >
              <Link to="/wholesale-terms">Условия и скидки</Link>
            </Button>
          </div>
        </div>

        {/* Mock table preview */}
        <div className="rounded-lg border border-background/15 bg-background/5 p-3 backdrop-blur">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-2 pb-2 text-[10px] uppercase tracking-wider text-background/60">
            <span>Артикул / товар</span>
            <span className="text-right">Кор.</span>
            <span className="text-right">Сумма</span>
          </div>
          {[
            { sku: "PIL-070-IV", name: "Столбчатая 7×15, ivory", qty: 8, sum: "15 360 ₽" },
            { sku: "TAP-024-WH", name: "Конусная 24 см, белая", qty: 12, sum: "8 640 ₽" },
            { sku: "TEA-038-AM", name: "Tealight, янтарь, 50 шт", qty: 5, sum: "6 250 ₽" },
          ].map((r) => (
            <div
              key={r.sku}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md px-2 py-2.5 text-sm hover:bg-background/5"
            >
              <div className="min-w-0">
                <div className="num text-xs text-background/60">{r.sku}</div>
                <div className="truncate font-medium">{r.name}</div>
              </div>
              <div className="price text-sm">{r.qty}</div>
              <div className="price text-sm text-primary">{r.sum}</div>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-background/15 px-2 pt-3">
            <span className="text-xs text-background/60">Скидка 5% применена</span>
            <span className="price text-base">Итого 28 747 ₽</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default QuickOrderTeaser;
