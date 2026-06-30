import { Link } from "react-router-dom";
import { ArrowRight, FileCheck2, PackageOpen, ShoppingBag, Truck } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";

const steps = [
  { icon: ShoppingBag, n: "01", title: "Выберите", text: "Добавляйте товары коробками — цены и остатки уже актуальны." },
  { icon: PackageOpen, n: "02", title: "Отправьте заявку", text: "Минимальной суммы нет. Достаточно одной коробки любого товара." },
  { icon: FileCheck2, n: "03", title: "Получите счёт", text: "Менеджер проверит заказ и пришлёт документы в течение двух часов." },
  { icon: Truck, n: "04", title: "Примите поставку", text: "После оплаты резервируем заказ и передаём его в доставку." },
];

const HowItWorks = () => {
  const reduceMotion = useReducedMotion();
  return (
    <>
      <section className="container py-16 md:py-24">
        <motion.div initial={reduceMotion ? false : { opacity: 0.25, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }} className="mx-auto max-w-3xl text-center"><div className="eyebrow">От выбора до поставки</div><h2 className="mt-4 font-display text-[clamp(2.4rem,4.5vw,4.5rem)] leading-none">Понятный опт в четыре шага</h2><p className="mx-auto mt-5 max-w-xl text-muted-foreground">Заказ оформляется как в обычном интернет-магазине, а документы и детали поставки берёт на себя менеджер.</p></motion.div>
        <ol className="relative mt-12 grid gap-4 md:grid-cols-4">
          <motion.div aria-hidden initial={reduceMotion ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.85, delay: 0.12, ease: [0.22, 1, 0.36, 1] }} className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-px origin-left bg-border md:block" />
          {steps.map(({ icon: Icon, n, title, text }, index) => (
            <motion.li
              key={n}
              initial={reduceMotion ? false : { opacity: 0.3, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              whileHover={reduceMotion ? undefined : { y: -3 }}
              transition={{ duration: 0.48, delay: 0.1 + index * 0.09, ease: [0.22, 1, 0.36, 1] }}
              className="relative rounded-3xl border border-border/70 bg-background p-5 text-center md:border-0 md:bg-transparent"
            >
              <span className="relative z-10 mx-auto grid h-14 w-14 place-items-center rounded-full border border-border bg-surface text-primary shadow-sm"><Icon className="h-5 w-5" /></span>
              <div className="mt-5 text-[10px] font-semibold tracking-[0.2em] text-primary">ШАГ {n}</div><h3 className="mt-2 font-display text-2xl">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </motion.li>
          ))}
        </ol>
      </section>
      <section className="container pb-8 md:pb-16">
        <motion.div initial={reduceMotion ? false : { opacity: 0.35, y: 34, scale: 0.985 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }} className="relative overflow-hidden rounded-[2rem] bg-primary px-6 py-12 text-primary-foreground sm:px-10 md:px-16 md:py-16">
          <motion.div aria-hidden animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 28, repeat: Infinity, ease: "linear" }} className="absolute -right-20 -top-28 h-80 w-80 rounded-full border-[52px] border-white/10" />
          <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end"><div className="max-w-3xl"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Можно начать сегодня</div><h2 className="mt-4 font-display text-[clamp(2.5rem,5vw,5rem)] leading-[0.95]">Первая поставка — от одной коробки</h2><p className="mt-5 max-w-xl text-white/80">Откройте каталог, соберите тестовую полку и посмотрите итоговую выгоду ещё до отправки заявки.</p></div><Button asChild size="lg" variant="hero" className="group shrink-0 bg-white text-foreground hover:bg-white/90"><Link to="/catalog">Собрать заказ <ArrowRight className="transition-transform group-hover:translate-x-1" /></Link></Button></div>
        </motion.div>
      </section>
    </>
  );
};

export default HowItWorks;
