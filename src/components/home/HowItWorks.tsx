import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  { n: "01", title: "Соберите заявку", text: "В каталоге, через быстрый заказ или импорт из Excel." },
  { n: "02", title: "Отправьте", text: "Без онлайн-оплаты. Минимальный заказ — 1 коробка." },
  { n: "03", title: "Получите счёт", text: "Менеджер подтвердит наличие и пришлёт реквизиты в течение 2 часов." },
  { n: "04", title: "Оплата и отгрузка", text: "После оплаты резервируем и отгружаем за 1–2 рабочих дня." },
];

const HowItWorks = () => {
  return (
    <section className="border-y border-border bg-surface">
      <div className="container py-16 md:py-20">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-xl">
            <div className="eyebrow mb-3">Как это работает</div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Четыре шага от каталога до отгрузки
            </h2>
          </div>
          <Button asChild variant="default" className="gap-2">
            <Link to="/catalog">
              Начать заказ <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n} className="bg-surface p-6">
              <span className="price text-3xl text-primary">{s.n}</span>
              <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default HowItWorks;
