import { Link } from "react-router-dom";
import { ArrowUpRight, Boxes } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Reveal from "@/components/ui/reveal";
import { catalogApi } from "@/lib/api/catalog";

const TopCategories = () => {
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => catalogApi.listCategories(),
  });

  const visible = categories.slice(0, 5);

  if (visible.length === 0) return null;

  return (
    <section className="container py-12 md:py-20">
      <Reveal>
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <div className="eyebrow mb-3">Каталог</div>
            <h2 className="font-semibold tracking-tight text-[clamp(1.375rem,3vw,1.875rem)]">
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

      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-5">
        {visible.map((c, idx) => (
          <Reveal key={c.id} delay={idx * 90} y={20}>
            <Link
              to={`/catalog/${c.slug}`}
              className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-border bg-surface p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-primary/50 hover:shadow-md"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/5 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
              />
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-sm group-hover:shadow-primary/30">
                <Boxes className="h-6 w-6" />
              </div>
              <span className="mt-5 block text-sm font-semibold leading-snug transition-colors group-hover:text-primary">
                {c.name_ru}
              </span>
              <span className="mt-4 inline-flex items-center justify-end text-xs text-muted-foreground">
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
};

export default TopCategories;
