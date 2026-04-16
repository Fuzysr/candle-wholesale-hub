import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

const categories = [
  { name: "Столбчатые свечи", count: 84, slug: "pillar" },
  { name: "Конусные / тонкие", count: 56, slug: "taper" },
  { name: "Чайные (tealight)", count: 32, slug: "tealight" },
  { name: "Ароматические в банке", count: 41, slug: "jar" },
  { name: "Декоративные фигурные", count: 27, slug: "shaped" },
  { name: "Плавающие", count: 18, slug: "floating" },
];

const TopCategories = () => {
  return (
    <section className="container py-16 md:py-20">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-3">Каталог</div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Популярные категории
          </h2>
        </div>
        <Link
          to="/catalog"
          className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline md:inline-flex"
        >
          Все категории
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {categories.map((c) => (
          <Link
            key={c.slug}
            to={`/catalog/${c.slug}`}
            className="group flex flex-col justify-between rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-accent"
          >
            <span className="text-sm font-semibold leading-snug">{c.name}</span>
            <span className="mt-6 inline-flex items-center justify-between text-xs text-muted-foreground">
              <span className="num">{c.count} артикулов</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default TopCategories;
