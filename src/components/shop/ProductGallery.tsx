import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ResponsiveProductImage from "@/components/catalog/ResponsiveProductImage";
import { getProductImage } from "@/lib/productImages";

type Props = { images: string[]; alt: string };

const ZOOM_SCALE = 2.5;
const SLIDE_DURATION = 400; // ms

/* ------------------------------------------------------------------ */
/*  Helper: distance between two touch points                         */
/* ------------------------------------------------------------------ */
const touchDist = (a: React.Touch, b: React.Touch) =>
  Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

const touchCenter = (a: React.Touch, b: React.Touch) => ({
  x: (a.clientX + b.clientX) / 2,
  y: (a.clientY + b.clientY) / 2,
});

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const ProductGallery = ({ images, alt }: Props) => {
  const list = images.length ? images : [""];
  const [active, setActive] = useState(0);

  // Slide animation state
  const [slide, setSlide] = useState<{
    nextIndex: number;
    dir: "left" | "right";
    phase: "enter" | "move";
  } | null>(null);

  // Desktop zoom (magnifier) state
  const [zooming, setZooming] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });

  // Touch pinch-zoom + drag state
  const [touchZoom, setTouchZoom] = useState(1);
  const [touchPan, setTouchPan] = useState({ x: 0, y: 0 });
  const [isTouchZoomed, setIsTouchZoomed] = useState(false);
  const pinchRef = useRef({ startDist: 0, startScale: 1 });
  const panRef = useRef({ startX: 0, startY: 0, panStartX: 0, panStartY: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  const current = list[active] ?? list[0];

  // Reset active when images change (variant switch)
  useEffect(() => {
    setActive(0);
    setSlide(null);
    resetTouchZoom();
  }, [images]);

  const resetTouchZoom = () => {
    setTouchZoom(1);
    setTouchPan({ x: 0, y: 0 });
    setIsTouchZoomed(false);
  };

  const goTo = useCallback(
    (idx: number) => {
      if (idx === active || slide !== null || list.length <= 1) return;
      resetTouchZoom();
      const dir = idx > active ? "right" : "left";
      setSlide({ nextIndex: idx, dir, phase: "enter" });
    },
    [active, slide, list.length],
  );

  // Phase 2: after "enter" is painted, trigger the "move" transition
  useEffect(() => {
    if (!slide || slide.phase !== "enter") return;
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        setSlide((prev) => (prev ? { ...prev, phase: "move" } : null));
      });
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [slide]);

  const handleSlideTransitionEnd = () => {
    if (!slide) return;
    setActive(slide.nextIndex);
    setSlide(null);
  };

  const goPrev = () => goTo(active <= 0 ? list.length - 1 : active - 1);
  const goNext = () => goTo(active >= list.length - 1 ? 0 : active + 1);

  // Desktop zoom handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x, y });
  };

  const handleMouseEnter = () => {
    if (!slide) setZooming(true);
  };
  const handleMouseLeave = () => setZooming(false);

  /* ---------------------------------------------------------------- */
  /*  Touch handlers: single-tap zoom toggle + drag when zoomed       */
  /* ---------------------------------------------------------------- */
  const didMoveRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (slide) return;
    didMoveRef.current = false;

    if (e.touches.length === 2) {
      // Pinch start
      e.preventDefault();
      const dist = touchDist(e.touches[0], e.touches[1]);
      pinchRef.current = { startDist: dist, startScale: touchZoom };
    } else if (e.touches.length === 1 && isTouchZoomed) {
      // Pan start (only when zoomed in)
      e.preventDefault();
      panRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        panStartX: touchPan.x,
        panStartY: touchPan.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (slide) return;
    didMoveRef.current = true;

    if (e.touches.length === 2) {
      // Pinch move
      e.preventDefault();
      const dist = touchDist(e.touches[0], e.touches[1]);
      const ratio = dist / pinchRef.current.startDist;
      const newScale = clamp(pinchRef.current.startScale * ratio, 1, 4);
      setTouchZoom(newScale);
      setIsTouchZoomed(newScale > 1.05);

      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const center = touchCenter(e.touches[0], e.touches[1]);
        const cx = ((center.x - rect.left) / rect.width) * 100;
        const cy = ((center.y - rect.top) / rect.height) * 100;
        setZoomPos({ x: cx, y: cy });
      }
    } else if (e.touches.length === 1 && isTouchZoomed) {
      // Pan move
      e.preventDefault();
      const dx = e.touches[0].clientX - panRef.current.startX;
      const dy = e.touches[0].clientY - panRef.current.startY;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxPanX = (rect.width * (touchZoom - 1)) / 2;
      const maxPanY = (rect.height * (touchZoom - 1)) / 2;
      setTouchPan({
        x: clamp(panRef.current.panStartX + dx, -maxPanX, maxPanX),
        y: clamp(panRef.current.panStartY + dy, -maxPanY, maxPanY),
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    // If pinch returned near 1 → reset
    if (e.touches.length === 0 && touchZoom <= 1.05 && !isTouchZoomed) {
      resetTouchZoom();
    }

    // Single tap (no drag) → toggle zoom
    if (
      e.touches.length === 0 &&
      e.changedTouches.length === 1 &&
      !didMoveRef.current
    ) {
      if (isTouchZoomed) {
        // Tap while zoomed → zoom out
        resetTouchZoom();
      } else {
        // Tap while normal → zoom in to tap point
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const t = e.changedTouches[0];
          setZoomPos({
            x: ((t.clientX - rect.left) / rect.width) * 100,
            y: ((t.clientY - rect.top) / rect.height) * 100,
          });
        }
        setTouchZoom(ZOOM_SCALE);
        setIsTouchZoomed(true);
        setTouchPan({ x: 0, y: 0 });
      }
    }
  };

  // Compute inline transforms for current & incoming slides
  const isSliding = slide !== null;
  const currentTransform = (() => {
    if (!slide) return "translateX(0)";
    if (slide.phase === "enter") return "translateX(0)";
    return slide.dir === "right" ? "translateX(-100%)" : "translateX(100%)";
  })();

  const nextTransform = (() => {
    if (!slide) return "translateX(0)";
    if (slide.phase === "enter") {
      return slide.dir === "right" ? "translateX(100%)" : "translateX(-100%)";
    }
    return "translateX(0)";
  })();

  const transitionStyle =
    slide?.phase === "move"
      ? `transform ${SLIDE_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`
      : "none";

  // Build the main image transform
  const mainImgTransform = (() => {
    if (isSliding) return currentTransform;
    // Touch zoom active
    if (isTouchZoomed) {
      return `scale(${touchZoom}) translate(${touchPan.x / touchZoom}px, ${touchPan.y / touchZoom}px)`;
    }
    // Desktop hover-zoom
    if (zooming) return `scale(${ZOOM_SCALE})`;
    return "translateX(0)";
  })();

  const mainImgOrigin = (() => {
    if (isSliding) return "center";
    if (isTouchZoomed) return `${zoomPos.x}% ${zoomPos.y}%`;
    if (zooming) return `${zoomPos.x}% ${zoomPos.y}%`;
    return "center";
  })();

  const mainImgTransition = (() => {
    if (isSliding) return transitionStyle;
    if (isTouchZoomed) return "none";
    if (zooming) return "transform 0.15s ease-out";
    return "none";
  })();

  return (
    <div>
      {/* Main image viewport */}
      <div
        ref={containerRef}
        className="group relative overflow-hidden rounded-2xl border border-border bg-surface touch-none"
        style={{ cursor: zooming && !isSliding ? "crosshair" : "default" }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Current image */}
        <ResponsiveProductImage
          src={getProductImage(current)}
          alt={alt}
          className="aspect-[3/4] w-full bg-muted object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          loading="eager"
          fetchPriority="high"
          draggable={false}
          style={{
            transform: mainImgTransform,
            transformOrigin: mainImgOrigin,
            transition: mainImgTransition,
            willChange: "transform",
          }}
        />

        {/* Incoming slide */}
        {slide && (
          <img
            src={getProductImage(list[slide.nextIndex])}
            alt={alt}
            className="absolute inset-0 h-full w-full bg-muted object-cover"
            draggable={false}
            style={{
              transform: nextTransform,
              transition: transitionStyle,
              willChange: "transform",
            }}
            onTransitionEnd={handleSlideTransitionEnd}
          />
        )}

        {/* Touch zoom indicator */}
        {isTouchZoomed && (
          <div className="absolute left-3 top-3 z-20 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
            {touchZoom.toFixed(1)}×
          </div>
        )}

        {/* Arrows */}
        {list.length > 1 && !isTouchZoomed && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-foreground shadow-md backdrop-blur-sm transition-opacity hover:bg-white focus:outline-none opacity-0 group-hover:opacity-100"
              aria-label="Предыдущее фото"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-foreground shadow-md backdrop-blur-sm transition-opacity hover:bg-white focus:outline-none opacity-0 group-hover:opacity-100"
              aria-label="Следующее фото"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Dot indicators */}
        {list.length > 1 && !isTouchZoomed && (
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {list.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                className={`h-2 rounded-full transition-all duration-200 ${
                  i === active
                    ? "w-4 bg-primary"
                    : "w-2 bg-white/60 hover:bg-white/80"
                }`}
                aria-label={`Фото ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {list.length > 1 && (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
          {list.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => goTo(i)}
              className={`overflow-hidden rounded-md border bg-surface transition-colors ${
                i === active
                  ? "border-primary ring-1 ring-primary"
                  : "border-border hover:border-primary/40"
              }`}
              aria-label={`Фото ${i + 1}`}
            >
              <ResponsiveProductImage
                src={getProductImage(src)}
                alt=""
                className="aspect-[3/4] w-full object-cover"
                sizes="(max-width: 768px) 25vw, 160px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductGallery;
