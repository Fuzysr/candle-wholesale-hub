import { Boxes, Percent, Truck, FileText } from "lucide-react";
import Reveal from "@/components/ui/reveal";

const items = [
  {
    icon: Boxes,
    title: "От 1 коробки",
    text: "Минимальный заказ — одна коробка любого товара. Не нужно набирать минимум по сумме.",
  },
  {
    icon: Percent,
    title: "Скидка от объёма",
    text: "До 15% автоматически — чем больше коробок, тем выгоднее. Видно прямо в корзине.",
  },
  {
    icon: Truck,
    title: "Отгрузка 1–2 дня",
    text: "Резерв остатков сразу после принятия заявки. Доставка по РФ или самовывоз со склада.",
  },
  {
    icon: FileText,
    title: "Работа по договору",
    text: "Заявка → счёт на email → оплата по реквизитам. Закрывающие документы в комплекте.",
  },
];

const Benefits = () => {
  return (
    <section className="container py-16 md:py-20">
      <Reveal>
        <div className="mb-10 max-w-2xl">
          <div className="eyebrow mb-3">Почему B2B-клиенты выбирают нас</div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Опт без лишних шагов
          </h2>
        </div>
      </Reveal>
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, text }, idx) => (
          <Reveal key={title} delay={idx * 110} y={20}>
            <div className="group h-full bg-surface p-6 transition-colors duration-300 hover:bg-accent">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-sm group-hover:shadow-primary/30">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold transition-colors group-hover:text-primary">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
};

export default Benefits;
