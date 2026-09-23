import { Link } from "react-router-dom";
import { useAppStore } from "@/store/appStore";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { getProductImage } from "@/lib/productImages";

type Props = { excludeId?: string; title?: string };

const RecentlyViewed = ({ excludeId, title = "Вы недавно смотрели" }: Props) => {
  const { lang } = useAppStore();
  const { items } = useRecentlyViewed(excludeId);

  if (items.length === 0) return null;

  return (
    <section className="border-t border-border bg-surface/40">
      <div className="container py-8 sm:py-12">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.slice(0, 6).map((p) => (
            <Link
              key={p.id}
              to={`/product/${p.slug}`}
              className="group overflow-hidden rounded-lg border border-border bg-background transition-shadow hover:shadow-md"
            >
              <div className="aspect-[3/4] overflow-hidden bg-muted">
                <img
                  src={getProductImage(p.image_url)}
                  alt={lang === "ru" ? p.name_ru : p.name_en}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-2.5">
                <div className="line-clamp-2 text-xs font-medium group-hover:text-primary">
                  {lang === "ru" ? p.name_ru : p.name_en}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RecentlyViewed;
