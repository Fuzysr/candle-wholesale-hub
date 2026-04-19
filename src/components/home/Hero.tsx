import { Link } from "react-router-dom";
import { ArrowRight, Zap, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import Reveal from "@/components/ui/reveal";
import CountUp from "@/components/ui/count-up";
import { cn } from "@/lib/utils";
import heroImage from "@/assets/hero-candles.jpg";

const Hero = () => {
  return (
    <section className="border-b border-border">
      <div className="container grid items-center gap-10 py-12 md:py-20 lg:grid-cols-2 lg:gap-16">
        <div className="animate-fade-in">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-primary/20 bg-gradient-to-r from-primary/30 via-primary/12 to-surface px-4 py-2 text-sm font-medium text-foreground/80 shadow-[0_10px_22px_-6px_rgba(0,0,0,0.28),0_4px_8px_-2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-sm">
            <Package className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
            Оптовые поставки свечей
          </div>

          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
            Свечи оптом для&nbsp;<span className="text-primary">бизнеса</span>&nbsp;— от&nbsp;1&nbsp;коробки
          </h1>
          <p className="mt-5 max-w-lg text-base text-muted-foreground md:text-lg">
            Прямые отгрузки со склада для декораторов, флористов, отелей и event-агентств.
            Счёт по реквизитам в течение 2 часов, скидки от объёма и отгрузка за&nbsp;1–2&nbsp;рабочих дня.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" variant="hero" className="gap-2 group">
              <Link to="/catalog">
                Перейти в каталог
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2">
              <Link to="/quick-order">
                <Zap className="h-4 w-4 text-primary" />
                Быстрый заказ
              </Link>
            </Button>
          </div>

          {/* Mini KPI strip with staggered reveal, count-up & per-cell hover */}
          <dl className="mt-10 grid grid-cols-3 gap-2 border-t border-border pt-6 max-w-md">
            <Reveal delay={0} y={18}>
              <div className="group relative -mx-2 cursor-default rounded-md px-2 py-2 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-accent/60">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-2 right-2 top-0 h-px origin-left scale-x-0 bg-primary/70 transition-transform duration-500 ease-out group-hover:scale-x-100"
                />
                <dt className="text-xs uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
                  Минимум
                </dt>
                <dd className="mt-1 price text-xl transition-colors group-hover:text-primary">
                  <CountUp to={1} duration={900} /> коробка
                </dd>
              </div>
            </Reveal>
            <Reveal delay={180} y={18}>
              <div className="group relative -mx-2 cursor-default rounded-md px-2 py-2 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-accent/60">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-2 right-2 top-0 h-px origin-left scale-x-0 bg-primary/70 transition-transform duration-500 ease-out group-hover:scale-x-100"
                />
                <dt className="text-xs uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
                  Скидка
                </dt>
                <dd className="mt-1 price text-xl transition-colors group-hover:text-primary">
                  до&nbsp;<CountUp to={15} duration={1400} />%
                </dd>
              </div>
            </Reveal>
            <Reveal delay={360} y={18}>
              <div className="group relative -mx-2 cursor-default rounded-md px-2 py-2 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-accent/60">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-2 right-2 top-0 h-px origin-left scale-x-0 bg-primary/70 transition-transform duration-500 ease-out group-hover:scale-x-100"
                />
                <dt className="text-xs uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
                  Отгрузка
                </dt>
                <dd className="mt-1 price text-xl transition-colors group-hover:text-primary">
                  1–2 дня
                </dd>
              </div>
            </Reveal>
          </dl>
        </div>

        {/* Visual — cinematic reveal: translate + scale + blur, softer than `fade-in` */}
        <div
          className="relative animate-hero-in [transform-origin:50%_60%] motion-reduce:animate-none"
          style={{ animationDelay: "200ms" }}
        >
          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-md">
            <img
              src={heroImage}
              alt="Ассортимент свечей для оптовых заказов: столбчатые и конусные свечи в светлых и янтарных оттенках"
              className="aspect-[5/4] w-full object-cover"
              loading="eager"
            />
          </div>

          {/*
            Floating spec card.
            IMPORTANT: the entry animation `animate-card-in` has `animation-fill-mode: both`,
            which pins `transform` on the animated element and would *override* any hover
            transform per the CSS Animations spec. So we split responsibilities:
              - outer <div>  → absolute position + entry animation (owns animated transform)
              - inner <Link> → hover lift (owns interactive transform)
          */}
          <div
            className="absolute -bottom-5 -left-3 hidden w-64 animate-card-in motion-reduce:animate-none sm:block md:-left-6"
            style={{ animationDelay: "450ms" }}
          >
            <Link
              to="/catalog?q=PIL-070-IV"
              aria-label="Перейти к товару PIL-070-IV: Свеча столбчатая 7×15 см"
              className={cn(
                "group relative block rounded-lg border border-border bg-surface p-4 shadow-md transition-all duration-500 ease-out",
                // Pronounced lift on hover: 12px up + 3% scale + amber-tinted 2xl shadow
                "hover:-translate-y-3 hover:scale-[1.03] hover:border-primary/60 hover:shadow-2xl hover:shadow-primary/30",
                "focus-visible:-translate-y-3 focus-visible:scale-[1.03] focus-visible:border-primary/60 focus-visible:shadow-2xl focus-visible:shadow-primary/30",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "motion-reduce:transform-none motion-reduce:transition-none",
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
                  Артикул PIL-070-IV
                </span>
                <span className="rounded-sm bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success transition-transform duration-300 group-hover:scale-110">
                  в наличии
                </span>
              </div>
              <div className="mt-2 text-sm font-medium transition-colors duration-300 group-hover:text-primary">
                Свеча столбчатая 7×15 см
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">за коробку (12 шт)</span>
                <span className="price text-base transition-colors duration-300 group-hover:text-primary">
                  1 920 ₽
                </span>
              </div>
              {/* Amber underline that scales in as the card lifts */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-4 bottom-1.5 h-px origin-left scale-x-0 bg-primary/60 transition-transform duration-500 ease-out group-hover:scale-x-100"
              />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
