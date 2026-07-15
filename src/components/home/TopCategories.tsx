import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { catalogApi } from "@/lib/api/catalog";
import jar from "@/assets/products/jar-amber.jpg";
import pillar from "@/assets/products/pillar-ivory.jpg";
import taper from "@/assets/products/taper-white.jpg";
import sphere from "@/assets/products/sphere.jpg";
import tealight from "@/assets/products/tealight.jpg";

const images = [jar, pillar, taper, sphere, tealight];
const fallbackCategories = [
  { id: "aromatic", slug: "aromatic", name_ru: "Ароматические" },
  { id: "pillar", slug: "pillar", name_ru: "Столбовые" },
  { id: "taper", slug: "taper", name_ru: "Столовые" },
  { id: "decorative", slug: "decorative", name_ru: "Декоративные" },
  { id: "tealights", slug: "tealights", name_ru: "Чайные" },
];

const TopCategories = () => {
  const reduceMotion = useReducedMotion();
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: () => catalogApi.listCategories() });
  const visible = categories.length ? categories.slice(0, 5) : fallbackCategories;
  return (
    <section className="border-y border-border/70 bg-foreground py-16 text-background md:py-24">
      <div className="container">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0.3, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"
        >
          <div><div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Живой ассортимент</div><h2 className="mt-4 max-w-2xl font-display text-[clamp(2.4rem,4.5vw,4.6rem)] leading-none">Соберите полку под свой формат</h2></div>
          <Link to="/catalog" className="group flex items-center gap-2 text-sm font-semibold">Все товары <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
        </motion.div>
        <div className="grid auto-rows-[240px] gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:auto-rows-[270px]">
          {visible.map((category, index) => (
            <motion.div
              key={category.id}
              initial={reduceMotion ? false : { opacity: 0.35, scale: 0.96, clipPath: "inset(10% 0% 10% 0% round 24px)" }}
              whileInView={{ opacity: 1, scale: 1, clipPath: "inset(0% 0% 0% 0% round 24px)" }}
              viewport={{ once: true, amount: 0.2 }}
              whileHover={reduceMotion ? undefined : { y: -3 }}
              transition={{ duration: 0.58, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
              className={index < 2 ? "lg:col-span-3" : "lg:col-span-2"}
            >
              <Link to={`/catalog/${category.slug}`} className="group relative block h-full overflow-hidden rounded-3xl bg-muted">
                <img src={images[index % images.length]} alt="" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5"><div><div className="text-xs text-white/65">Категория</div><h3 className="mt-1 font-display text-2xl text-white">{category.name_ru}</h3></div><span className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#241b16] transition-transform group-hover:rotate-[-8deg]"><ArrowRight className="h-4 w-4" /></span></div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TopCategories;
