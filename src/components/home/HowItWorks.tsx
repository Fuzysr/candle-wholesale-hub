import { Link } from "react-router-dom";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

import Reveal from "@/components/ui/reveal";



const steps = [

  { n: "01", title: "Соберите заявку", text: "В каталоге, через быстрый заказ или импорт из Excel." },

  { n: "02", title: "Отправьте", text: "Без онлайн-оплаты. Минимальный заказ — 1 коробка." },

  { n: "03", title: "Получите счёт", text: "Менеджер подтвердит наличие и пришлёт реквизиты в течение 2 часов." },

  { n: "04", title: "Оплата и отгрузка", text: "После оплаты резервируем и отгружаем за 1–2 рабочих дня." },

];



const HowItWorks = () => {

  /*

    "Начать заказ" CTA placement:

      - md+ : sits next to the heading (right column of the section header).

      - <md : moves to the very end of the section, after the four steps —

              the user has read the explanation and is ready to act, so the

              CTA is visible without pre-empting the content. We render the

              same button twice with mutually-exclusive responsive classes

              instead of moving a single instance with CSS, because Tailwind

              has no `order` token that would re-flow it across grid/flex

              boundaries cleanly.

  */

  const cta = (

    <Button asChild variant="default" className="gap-2 group">

      <Link to="/catalog">

        Начать заказ

        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />

      </Link>

    </Button>

  );



  return (

    <section className="border-y border-border bg-surface">

      <div className="container py-12 md:py-20">

        <Reveal>

          <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">

            <div className="max-w-xl">

              <div className="eyebrow mb-3">Как это работает</div>

              <h2 className="font-semibold tracking-tight text-[clamp(1.375rem,3vw,1.875rem)]">

                Четыре шага от каталога до отгрузки

              </h2>

            </div>

            <div className="hidden md:inline-flex">{cta}</div>

          </div>

        </Reveal>



        <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border grid-cols-1 sm:grid-cols-2 md:grid-cols-4">

          {steps.map((s, idx) => (

            <Reveal key={s.n} delay={idx * 130} y={20}>

              <li className="group h-full bg-surface p-6 transition-colors duration-300 hover:bg-accent">

                <span className="price text-3xl text-primary transition-transform duration-300 group-hover:translate-x-0.5">

                  {s.n}

                </span>

                <h3 className="mt-3 text-base font-semibold transition-colors group-hover:text-primary">

                  {s.title}

                </h3>

                <p className="mt-1.5 text-sm text-muted-foreground">{s.text}</p>

              </li>

            </Reveal>

          ))}

        </ol>



        {/* Mobile-only CTA at the end of the flow */}

        <Reveal delay={steps.length * 130 + 80} y={16}>

          <div className="mt-8 flex justify-center md:hidden">{cta}</div>

        </Reveal>

      </div>

    </section>

  );

};



export default HowItWorks;

