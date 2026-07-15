import { useMemo, useState } from "react";
import PublicLayout from "@/components/layout/PublicLayout";
import Reveal from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

/*
  Gallery — публичная страница с подборкой фото продукции, интерьерных
  решений и закулисья производства. Картинки загружаются с Unsplash CDN
  (статичные ID, без рандомизации), чтобы при каждом заходе сетка была
  одинаковой и кешировалась браузером. На случай сетевой ошибки каждый
  тайл лежит на тёплом градиентном фоне — выглядит аккуратно даже без
  изображения.
*/

type CategoryId = "all" | "products" | "interiors" | "production";

type GalleryItem = {
  id: string;
  /** Unsplash photo URL (без query — query добавляется в рендере). */
  src: string;
  alt: string;
  category: Exclude<CategoryId, "all">;
  /**
   * Соотношение сторон тайла. Разные значения дают аккуратный
   * masonry-вид через CSS columns (см. рендер ниже).
   */
  aspect: "4/5" | "1/1" | "3/4" | "4/3" | "3/5";
};

/*
  Hand-picked Unsplash photo IDs — свечи, тёплые интерьеры, мастерская.
  Идентификаторы стабильные (не "random"), поэтому одни и те же снимки
  попадают в кеш браузера и одинаково выглядят на всех устройствах.
*/
const ITEMS: GalleryItem[] = [
  {
    id: "g1",
    src: "https://images.unsplash.com/photo-1602874801006-7b5d6f7e3a76",
    alt: "Подвесные тёплые светильники в интерьере",
    category: "interiors",
    aspect: "4/5",
  },
  {
    id: "g2",
    src: "https://images.unsplash.com/photo-1603006905003-be475563bc59",
    alt: "Свечи в стеклянных банках на тёмном фоне",
    category: "products",
    aspect: "1/1",
  },
  {
    id: "g3",
    src: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3",
    alt: "Уютный интерьер ресторана со свечами на столах",
    category: "interiors",
    aspect: "4/5",
  },
  {
    id: "g4",
    src: "https://images.unsplash.com/photo-1574173935-3b7c5af66bb8",
    alt: "Производственная линия со свечами в банках",
    category: "production",
    aspect: "3/4",
  },
  {
    id: "g5",
    src: "https://images.unsplash.com/photo-1601312378427-822b2b41da35",
    alt: "Свеча в тёмной банке крупным планом",
    category: "products",
    aspect: "1/1",
  },
  {
    id: "g6",
    src: "https://images.unsplash.com/photo-1574117936532-46e544aeb239",
    alt: "Расслабляющая ванна со свечами",
    category: "interiors",
    aspect: "4/5",
  },
  {
    id: "g7",
    src: "https://images.unsplash.com/photo-1604322055478-e9b67c7b3a86",
    alt: "Полки магазина свечей с подсветкой",
    category: "production",
    aspect: "4/5",
  },
  {
    id: "g8",
    src: "https://images.unsplash.com/photo-1601056639638-cefe88e5e3ac",
    alt: "Зажжённая свеча в стеклянной банке",
    category: "products",
    aspect: "4/3",
  },
  {
    id: "g9",
    src: "https://images.unsplash.com/photo-1532009324734-20a7a5813719",
    alt: "Стеллажи склада со свечами",
    category: "production",
    aspect: "3/4",
  },
];

const FILTERS: { id: CategoryId; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "products", label: "Продукция" },
  { id: "interiors", label: "Интерьеры" },
  { id: "production", label: "Производство" },
];

/** Параметры запроса к Unsplash CDN — формат и качество. */
const IMG_QUERY = "?auto=format&fit=crop&w=900&q=75";

const Gallery = () => {
  const [active, setActive] = useState<CategoryId>("all");

  // Фильтр по категории. На "all" — выводим все элементы.
  const filtered = useMemo(
    () => (active === "all" ? ITEMS : ITEMS.filter((i) => i.category === active)),
    [active],
  );

  return (
    <PublicLayout>
      {/* ───────── Hero ───────── */}
      <section className="container max-w-5xl pt-8 pb-6 text-center sm:pt-12 sm:pb-8 md:pt-16">
        <Reveal delay={0} y={20}>
          <div className="eyebrow mb-3 inline-flex items-center">Наши работы</div>
        </Reveal>

        <Reveal delay={80} y={20}>
          <h1 className="font-semibold tracking-tight text-[clamp(1.75rem,5vw,3rem)]">
            Галерея
          </h1>
        </Reveal>

        <Reveal delay={160} y={18}>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground md:text-base">
            Наша продукция в интерьерах отелей, ресторанов и магазинов
          </p>
        </Reveal>

        {/* Фильтры */}
        <Reveal delay={240} y={16}>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {FILTERS.map((f) => {
              const isActive = active === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActive(f.id)}
                  aria-pressed={isActive}
                  className={cn(
                    "h-10 min-w-[44px] rounded-full px-4 text-sm font-medium transition-all duration-200 ease-out",
                    "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isActive
                      ? "border-transparent bg-foreground text-background shadow-sm shadow-foreground/20 hover:bg-foreground/90"
                      : "border-border bg-surface text-foreground/80 hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground hover:shadow-sm",
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </Reveal>
      </section>

      {/* ───────── Masonry-сетка ─────────
          CSS columns даёт настоящий masonry без JS. Каждый тайл должен
          избегать разрыва между колонками (`break-inside-avoid`) и иметь
          нижний отступ — иначе колонки сольются. */}
      <section className="container pb-16 md:pb-20">
        <div className="columns-2 gap-2 sm:gap-4 lg:columns-3">
          {filtered.map((item, idx) => (
            <GalleryTile key={item.id} item={item} index={idx} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted-foreground">
            В этой категории пока нет фото — загляните позже.
          </div>
        )}
      </section>

    </PublicLayout>
  );
};

/**
 * Отдельный тайл галереи — обёртка с тёплым градиентным фоном (фолбек,
 * пока картинка грузится / если не загрузилась) и анимацией зум-ин при
 * наведении.
 */
const GalleryTile = ({ item, index }: { item: GalleryItem; index: number }) => {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // Лёгкий каскадный эффект — каждая следующая плитка появляется чуть позже
  // соседней, но без перегруза задержками: max 360 мс.
  const delay = Math.min(index * 60, 360);

  return (
    <Reveal delay={delay} y={18} className="mb-4 block break-inside-avoid">
      <figure
        className={cn(
          "group relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/10 via-muted to-surface shadow-sm",
          "transition-all duration-500 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/15",
        )}
        style={{ aspectRatio: item.aspect.replace("/", " / ") }}
      >
        {!errored && (
          <img
            src={`${item.src}${IMG_QUERY}`}
            alt={item.alt}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out",
              "group-hover:scale-[1.04]",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        )}

        {/* Лёгкое затемнение снизу — чтобы будущие подписи (если добавим)
            читались поверх любого фото. Сейчас — просто декоративный штрих. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/25 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        />
      </figure>
    </Reveal>
  );
};

export default Gallery;
