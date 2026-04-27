import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Detect a hover-capable, fine-pointer device (i.e. desktop with a mouse).
 * On touch devices the lightning glow is skipped entirely — the constant raf
 * loop + SVG turbulence filter are extremely expensive on mobile GPUs and
 * the bright "white-hot core" of the conic gradient looks like a jagged
 * white outline at low frame rates. SSR-safe (returns false on the server).
 */
const useIsHoverDevice = () => {
  const [isHover, setIsHover] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setIsHover(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsHover(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return isHover;
};

/**
 * Wraps a button (or any element) with an electric / lightning glow border
 * that appears on hover.  Uses an SVG feTurbulence filter so the edges of the
 * glow look like real electric arcs, not a smooth gradient ring.
 *
 * The button's own solid background covers the centre of the gradient layers,
 * so only the protruding 3-8 px "border" is visible.
 */
export function LightningBorder({
  children,
  className,
  alwaysOn = false,
}: {
  children: React.ReactNode;
  className?: string;
  alwaysOn?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const filterId = `lt-${uid}`;
  const turbRef = useRef<SVGFETurbulenceElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const glowRef = useRef<HTMLSpanElement>(null);
  const outerRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const isHoverDevice = useIsHoverDevice();

  /* Activate glow on mount when alwaysOn is true (both desktop and touch —
     the visual `hovered` state is what gates the gradient layers; the
     desktop-only raf-cum-turbulence loop lives in the next effect). */
  useEffect(() => {
    if (alwaysOn) {
      const raf = requestAnimationFrame(() => setHovered(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [alwaysOn]);

  /* Animate turbulence seed (crackling) + conic-gradient angle (rotation).
     DESKTOP ONLY — on touch the same rotation runs as a CSS animation via
     the registered `--lb-a` property (see index.css). The SVG turbulence
     filter is the source of the bright "refracting white edge" on mobile
     GPUs, so we deliberately don't apply it there. */
  useEffect(() => {
    if (!isHoverDevice || !hovered) return;
    const turb = turbRef.current;
    const ring = ringRef.current;
    const glow = glowRef.current;
    const outer = outerRef.current;
    if (!turb || !ring || !glow || !outer) return;

    let angle = 0;
    let seed = 0;
    let frame = 0;
    let raf: number;

    const tick = () => {
      /* 2.4 deg/frame → full revolution ≈ 2.5 s at 60 fps */
      angle = (angle + 2.4) % 360;
      frame++;

      /* Change turbulence pattern every frame (60 fps) for smooth electric crackle */
      seed = (seed + 1) % 100;
      turb.setAttribute("seed", String(seed));

      const a = `${angle}deg`;
      ring.style.setProperty("--lb-a", a);
      glow.style.setProperty("--lb-a", a);
      outer.style.setProperty("--lb-a", a);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hovered, alwaysOn, isHoverDevice]);

  /* Palette matched to site primary (warm amber hsl 35 90% 50%).
     White-hot core → golden amber → warm bronze edges.
     Reads as electric energy, not fire, thanks to the SVG turbulence. */
  const RING_BG = `conic-gradient(
    from var(--lb-a, 0deg),
    transparent 0%, transparent 12%,
    #d9770640 18%, #d97706 26%, #f59e0b 34%, #fbbf24 42%,
    #fef9c3 50%,
    #fbbf24 58%, #f59e0b 66%, #d97706 74%, #d9770640 82%,
    transparent 88%, transparent 100%
  )`;

  const GLOW_BG = `conic-gradient(
    from var(--lb-a, 0deg),
    transparent 0%, transparent 20%,
    #d9770660 30%, #f59e0b80 42%, #fbbf24a0 50%, #f59e0b80 58%, #d9770660 70%,
    transparent 80%, transparent 100%
  )`;

  const OUTER_BG = `conic-gradient(
    from var(--lb-a, 0deg),
    transparent 0%, transparent 24%,
    #b4540030 36%, #d9770648 50%, #b4540030 64%,
    transparent 76%, transparent 100%
  )`;

  /* CSS-driven rotation for touch devices. On desktop the JS raf-loop
     above writes `--lb-a` directly each frame, so the inline animation is
     simply omitted (a no-op). */
  const cssAnim = !isHoverDevice && hovered
    ? "lb-rotate 2.5s linear infinite"
    : undefined;

  return (
    <span
      className={cn("relative isolate inline-flex overflow-visible rounded-md", className)}
      onMouseEnter={() => !alwaysOn && setHovered(true)}
      onMouseLeave={() => !alwaysOn && setHovered(false)}
    >
      {/*
        SVG turbulence filter — makes the glow edges jagged / electric.
        DESKTOP ONLY: on mobile GPUs the displacement-map pass produces a
        torn, refracting white outline at the bright core of the gradient,
        which is exactly the artefact the user reported. Skipping the
        filter altogether keeps the rotation but removes the noise.
      */}
      {isHoverDevice && (
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <defs>
            <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
              <feTurbulence
                ref={turbRef}
                type="fractalNoise"
                baseFrequency="0.04"
                numOctaves="4"
                seed="0"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="8"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
      )}

      {/* Inner border ring — tight, bright, distorted (desktop) / clean (touch) */}
      <span
        ref={ringRef}
        className="pointer-events-none absolute rounded-[inherit]"
        style={{
          inset: "-2px",
          background: RING_BG,
          filter: isHoverDevice && hovered ? `url(#${filterId})` : undefined,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.3s ease",
          animation: cssAnim,
          zIndex: 0,
        }}
      />

      {/* Mid glow — medium spread */}
      <span
        ref={glowRef}
        className="pointer-events-none absolute rounded-[inherit]"
        style={{
          inset: "-5px",
          background: GLOW_BG,
          filter: isHoverDevice && hovered
            ? `blur(3px) url(#${filterId})`
            : hovered
              ? "blur(3px)"
              : undefined,
          opacity: hovered ? 0.9 : 0,
          transition: "opacity 0.3s ease",
          animation: cssAnim,
          zIndex: 0,
        }}
      />

      {/* Outer glow — wide, soft, ambient light */}
      <span
        ref={outerRef}
        className="pointer-events-none absolute rounded-[inherit]"
        style={{
          inset: "-9px",
          background: OUTER_BG,
          filter: isHoverDevice && hovered
            ? `blur(8px) url(#${filterId})`
            : hovered
              ? "blur(8px)"
              : undefined,
          opacity: hovered ? 0.8 : 0,
          transition: "opacity 0.3s ease",
          animation: cssAnim,
          zIndex: 0,
        }}
      />

      <span className="relative" style={{ zIndex: 1 }}>
        {children}
      </span>
    </span>
  );
}
