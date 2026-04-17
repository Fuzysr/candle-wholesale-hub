import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RevealProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Animation delay in ms */
  delay?: number;
  /** Pixel offset the element travels from */
  y?: number;
  /** Disable the animation once it has played */
  once?: boolean;
  /** Duration in ms */
  duration?: number;
}

/**
 * Reveal — fades and slides its children into view once they intersect the viewport.
 * Respects prefers-reduced-motion and falls back to rendering immediately on SSR.
 */
// Silky-smooth "out-expo"-style curve, well-loved for reveal/fade motions.
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const Reveal = ({
  children,
  delay = 0,
  y = 28,
  once = true,
  duration = 1000,
  className,
  style,
  ...rest
}: RevealProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduce || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) io.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -80px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);

  return (
    <div
      ref={ref}
      style={{
        transform: visible ? "translateY(0)" : `translateY(${y}px)`,
        opacity: visible ? 1 : 0,
        filter: visible ? "blur(0px)" : "blur(4px)",
        transition: [
          `opacity ${duration}ms ${EASE} ${delay}ms`,
          `transform ${duration}ms ${EASE} ${delay}ms`,
          `filter ${Math.round(duration * 0.8)}ms ${EASE} ${delay}ms`,
        ].join(", "),
        willChange: "transform, opacity, filter",
        ...style,
      }}
      className={cn(className)}
      {...rest}
    >
      {children}
    </div>
  );
};

export default Reveal;
