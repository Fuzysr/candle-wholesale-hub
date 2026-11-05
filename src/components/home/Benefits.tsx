import { useRef } from "react";
import { Building2, RefreshCcw, Truck } from "lucide-react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";

const items = [
  { icon: Building2, title: "Небольшой старт", text: "Тестируйте новые формы и ароматы от одной коробки — без замороженных денег в остатках." },
  { icon: RefreshCcw, title: "Легко повторить заказ", text: "Сохраняем историю и состав заказов, чтобы пополнение полки занимало минуты." },
  { icon: Truck, title: "Предсказуемая отгрузка", text: "Подтверждаем наличие, резервируем товар и отгружаем за 1–2 рабочих дня." },
];

const Benefits = () => {
  const reduceMotion = useReducedMotion();
  const isMobile = useIsMobile();
  // `useIsMobile` updates after hydration. Read the viewport synchronously as
  // well, otherwise Motion can paint its desktop "initial" state for one
  // frame on a real phone and leave the cards washed out.
  const mobileViewport = typeof window !== "undefined" && window.innerWidth < 768;
  // Mobile Safari may batch IntersectionObserver and scroll callbacks during
  // a gesture. This section previously combined an entrance scale, a 38px
  // translate and delayed cards, which made the cards visibly jump in late.
  const simplifyMotion = reduceMotion || isMobile || mobileViewport;
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 72, damping: 24, mass: 0.35 });
  const glowY = useTransform(progress, [0, 1], [110, -120]);
  const glowX = useTransform(progress, [0, 1], [-36, 48]);
  const ringY = useTransform(progress, [0, 1], [-70, 90]);
  const ringRotate = useTransform(progress, [0, 1], [-18, 24]);
  const ribbonX = useTransform(progress, [0, 1], [-55, 55]);

  return (
    <section ref={sectionRef} className="relative isolate overflow-hidden border-y border-border/60 bg-surface/70">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,hsl(var(--surface))_0%,hsl(var(--background))_52%,hsl(var(--accent)/.52)_100%)]" />
        <motion.div
          style={simplifyMotion ? undefined : { x: glowX, y: glowY }}
          className="absolute -left-28 top-10 hidden h-[28rem] w-[28rem] rounded-full bg-primary/12 blur-[90px] md:block"
        />
        <motion.div
          style={simplifyMotion ? undefined : { y: ringY, rotate: ringRotate }}
          className="absolute -right-40 top-4 hidden h-[34rem] w-[34rem] rounded-full border-[72px] border-primary/[0.055] md:block"
        />
        <motion.div
          style={simplifyMotion ? undefined : { x: ribbonX }}
          className="absolute bottom-[-22%] left-[16%] hidden h-64 w-[70%] rotate-[-7deg] rounded-[50%] bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/.09),transparent)] blur-3xl md:block"
        />
        <svg viewBox="0 0 1200 620" preserveAspectRatio="none" className="absolute inset-0 hidden h-full w-full opacity-80 md:block">
          <defs>
            <linearGradient id="wax-line" x1="0" x2="1">
              <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0" />
              <stop offset="0.42" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
              <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            d="M -80 430 C 150 235 330 540 560 335 S 965 145 1280 315"
            fill="none"
            stroke="url(#wax-line)"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ pathLength: simplifyMotion ? 1 : progress }}
          />
          <motion.path
            d="M -40 470 C 210 310 370 565 610 380 S 1010 230 1240 350"
            fill="none"
            stroke="url(#wax-line)"
            strokeWidth="1"
            strokeLinecap="round"
            style={{ pathLength: simplifyMotion ? 1 : progress }}
          />
        </svg>
      </div>

      <div className="container relative z-10 py-16 md:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
        <motion.div
          initial={simplifyMotion ? false : { opacity: 0.25, x: -34 }}
          whileInView={simplifyMotion ? undefined : { opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="lg:sticky lg:top-28 lg:self-start"
        >
          <div className="eyebrow">Создано для малого бизнеса</div>
          <h2 className="mt-4 font-display text-[clamp(2.3rem,4vw,4rem)] leading-[0.98] tracking-tight">Закупка без лишнего риска</h2>
          <p className="mt-5 max-w-md text-muted-foreground">Не заставляем выбирать между красивой витриной и здоровым оборотом. Начните компактно, посмотрите спрос и пополняйте то, что действительно продаётся.</p>
        </motion.div>
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map(({ icon: Icon, title, text }, index) => (
            <motion.article
              key={title}
              initial={simplifyMotion ? false : { opacity: 0.25, y: 38, scale: 0.97 }}
              whileInView={simplifyMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              whileHover={simplifyMotion ? undefined : { y: -4 }}
              transition={{ duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="group rounded-3xl border border-white/70 bg-surface/88 p-6 shadow-[0_18px_50px_-38px_hsl(var(--foreground)/.38)] backdrop-blur-sm transition-[box-shadow,border-color] duration-300 hover:border-primary/30 hover:shadow-lg sm:p-8"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
              <h3 className="mt-8 font-display text-2xl">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </motion.article>
          ))}
        </div>
        </div>
      </div>
    </section>
  );
};

export default Benefits;
