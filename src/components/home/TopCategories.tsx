import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import Reveal from "@/components/ui/reveal";
import {
  PillarIcon,
  TaperIcon,
  TealightIcon,
  JarIcon,
  ShapedIcon,
  FloatingIcon,
  type CategoryIconProps,
} from "@/components/home/CategoryIcons";

type CategoryDef = {
  name: string;
  count: number;
  slug: string;
  Icon: (props: CategoryIconProps) => JSX.Element;
};

const categories: CategoryDef[] = [
  { name: "Столбчатые свечи", count: 84, slug: "pillar", Icon: PillarIcon },
  { name: "Конусные / тонкие", count: 56, slug: "taper", Icon: TaperIcon },
  { name: "Чайные (tealight)", count: 32, slug: "tealight", Icon: TealightIcon },
  { name: "Ароматические в банке", count: 41, slug: "jar", Icon: JarIcon },
  { name: "Декоративные фигурные", count: 27, slug: "shaped", Icon: ShapedIcon },
  { name: "Плавающие", count: 18, slug: "floating", Icon: FloatingIcon },
];

const TopCategories = () => {
  return (
    <section className="container py-16 md:py-20">
      <Reveal>
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <div className="eyebrow mb-3">Каталог</div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Популярные категории
            </h2>
          </div>
          <Link
            to="/catalog"
            className="group hidden items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-hover md:inline-flex"
          >
            Все категории
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Reveal>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {categories.map((c, idx) => {
          const Icon = c.Icon;
          return (
            <Reveal key={c.slug} delay={idx * 90} y={20}>
              <Link
                to={`/catalog/${c.slug}`}
                className="group relative flex h-full flex-col justify-between overflow-hidden rounded-lg border border-border bg-surface p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-primary/50 hover:shadow-md"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/5 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                />
                <div className="grid h-11 w-11 place-items-center rounded-md bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-sm group-hover:shadow-primary/30">
                  <Icon className="h-6 w-6" />
                </div>
                <span className="mt-5 block text-sm font-semibold leading-snug transition-colors group-hover:text-primary">
                  {c.name}
                </span>
                <span className="mt-4 inline-flex items-center justify-between text-xs text-muted-foreground">
                  <span className="num">{c.count} артикулов</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                </span>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
};

export default TopCategories;
