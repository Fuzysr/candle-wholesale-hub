import { useQuery } from "@tanstack/react-query";
import PublicLayout from "@/components/layout/PublicLayout";
import { stockApi } from "@/lib/api";

const WholesaleTerms = () => {
  const { data: tiers = [] } = useQuery({
    queryKey: ["discount-tiers"],
    queryFn: () => stockApi.listDiscountTiers(),
  });

  return (
    <PublicLayout>
      <div className="container max-w-3xl py-12">
        <div className="eyebrow mb-3">Для бизнеса</div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Условия оптовых поставок</h1>

        <section className="mt-10 space-y-2">
          <h2 className="text-xl font-semibold">Минимальный заказ</h2>
          <p className="text-sm text-foreground/80">Одна коробка любого товара. Не требуется минимум по сумме.</p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Скидки от объёма</h2>
          <p className="mt-2 text-sm text-foreground/80">Применяются автоматически от общего числа коробок в заявке.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiers.map((t) => (
              <div key={t.min_boxes} className="rounded-lg border border-border bg-surface p-4 text-center">
                <div className="num text-xs text-muted-foreground">от {t.min_boxes} кор.</div>
                <div className="price text-2xl text-primary">−{t.discount_percent}%</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Оплата</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/80">
            <li>Безналичный расчёт по реквизитам.</li>
            <li>Счёт выставляется после подтверждения наличия (в течение 2 часов в рабочее время).</li>
            <li>Закрывающие документы (УПД / товарная накладная) — в комплекте с отгрузкой.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Доставка</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/80">
            <li>Самовывоз со склада в Москве.</li>
            <li>Доставка по РФ транспортными компаниями (ПЭК, Деловые линии, СДЭК).</li>
            <li>Отгрузка за 1–2 рабочих дня после оплаты.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Возврат и брак</h2>
          <p className="mt-2 text-sm text-foreground/80">
            Брак фиксируется при приёмке и заменяется бесплатно. Возврат качественного товара возможен в течение 7 дней при условии сохранности упаковки.
          </p>
        </section>
      </div>
    </PublicLayout>
  );
};

export default WholesaleTerms;
