import { Link } from "react-router-dom";
import { ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-candles.jpg";

const Hero = () => {
  return (
    <section className="border-b border-border">
      <div className="container grid items-center gap-10 py-12 md:py-20 lg:grid-cols-2 lg:gap-16">
        <div className="animate-fade-in">
          <div className="eyebrow mb-4">B2B · Опт от 1 коробки</div>
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
            Свечи оптом для&nbsp;
            <span className="text-primary">декораторов</span>, флористов и&nbsp;отелей.
          </h1>
          <p className="mt-5 max-w-lg text-base text-muted-foreground md:text-lg">
            Прозрачные цены, скидки от объёма, отгрузка за 1–2 дня.
            Заявка вместо корзины — счёт по реквизитам в течение 2 часов.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" variant="hero" className="gap-2">
              <Link to="/catalog">
                Перейти в каталог
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2">
              <Link to="/quick-order">
                <Zap className="h-4 w-4 text-primary" />
                Быстрый заказ
              </Link>
            </Button>
          </div>

          {/* Mini KPI strip */}
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-border pt-6 max-w-md">
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Минимум</dt>
              <dd className="mt-1 price text-xl">1 коробка</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Скидка</dt>
              <dd className="mt-1 price text-xl">до&nbsp;15%</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Отгрузка</dt>
              <dd className="mt-1 price text-xl">1–2 дня</dd>
            </div>
          </dl>
        </div>

        {/* Visual */}
        <div className="relative">
          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-md">
            <img
              src={heroImage}
              alt="Ассортимент свечей для оптовых заказов: столбчатые и конусные свечи в светлых и янтарных оттенках"
              className="aspect-[5/4] w-full object-cover"
              loading="eager"
            />
          </div>

          {/* Floating spec card */}
          <div className="pointer-events-none absolute -bottom-5 -left-3 hidden w-64 rounded-lg border border-border bg-surface p-4 shadow-md sm:block md:-left-6">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-muted-foreground">Артикул PIL-070-IV</span>
              <span className="rounded-sm bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
                в наличии
              </span>
            </div>
            <div className="mt-2 text-sm font-medium">Свеча столбчатая 7×15 см</div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">за коробку (12 шт)</span>
              <span className="price text-base">1 920 ₽</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
