import type { SVGProps } from "react";

/**
 * Hand-authored category icons in the spirit of hugeicons.com
 * (stroke-based, 24×24 grid, 1.5 stroke, rounded caps/joins).
 * Each icon represents a candle category used on the home page.
 */
export type CategoryIconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Pillar / столбчатая свеча */
export const PillarIcon = (props: CategoryIconProps) => (
  <svg {...base} {...props} aria-hidden="true">
    {/* flame */}
    <path d="M12 2c1.2 1.3 2 2.5 2 3.8a2 2 0 1 1-4 0c0-1.3.8-2.5 2-3.8Z" />
    {/* wick */}
    <path d="M12 7v1.5" />
    {/* body */}
    <rect x="8" y="8.5" width="8" height="13" rx="1.2" />
    {/* top rim */}
    <path d="M8 11h8" />
  </svg>
);

/** Taper / конусная, тонкая */
export const TaperIcon = (props: CategoryIconProps) => (
  <svg {...base} {...props} aria-hidden="true">
    <path d="M12 2c1 1 1.6 2 1.6 3a1.6 1.6 0 1 1-3.2 0c0-1 .6-2 1.6-3Z" />
    <path d="M12 6.5V8" />
    {/* tapered body: narrow top, wider base */}
    <path d="M10.2 8.5 9 21.5h6L13.8 8.5Z" />
    <path d="M10 12.5h4" />
  </svg>
);

/** Tealight / чайная */
export const TealightIcon = (props: CategoryIconProps) => (
  <svg {...base} {...props} aria-hidden="true">
    {/* flame */}
    <path d="M12 5.5c.8.9 1.3 1.6 1.3 2.5a1.3 1.3 0 1 1-2.6 0c0-.9.5-1.6 1.3-2.5Z" />
    <path d="M12 9v1" />
    {/* cup */}
    <path d="M4 14.5h16l-1.3 5a1.5 1.5 0 0 1-1.5 1.1H6.8a1.5 1.5 0 0 1-1.5-1.1L4 14.5Z" />
    <path d="M4 14.5h16" />
    {/* inner wax */}
    <path d="M6 14.5c0-1.2.8-2 2-2h8c1.2 0 2 .8 2 2" />
  </svg>
);

/** Jar / ароматическая в банке */
export const JarIcon = (props: CategoryIconProps) => (
  <svg {...base} {...props} aria-hidden="true">
    {/* lid */}
    <rect x="7" y="2.5" width="10" height="3" rx="0.8" />
    {/* jar body */}
    <path d="M6.5 6.5h11l-.6 13.2a2 2 0 0 1-2 1.9H9.1a2 2 0 0 1-2-1.9L6.5 6.5Z" />
    {/* label */}
    <rect x="9" y="12" width="6" height="4.5" rx="0.6" />
    {/* scent waves */}
    <path d="M10 9.5c.6-.6 1.4-.6 2 0s1.4.6 2 0" />
  </svg>
);

/** Shaped / декоративные фигурные */
export const ShapedIcon = (props: CategoryIconProps) => (
  <svg {...base} {...props} aria-hidden="true">
    {/* small flame */}
    <path d="M12 2.5c.9 1 1.4 1.9 1.4 2.8a1.4 1.4 0 1 1-2.8 0c0-.9.5-1.8 1.4-2.8Z" />
    <path d="M12 6v1.3" />
    {/* faceted body: octagon-like */}
    <path d="M9.5 7.5h5l2 2.5v7.5l-2 3h-5l-2-3V10z" />
    {/* inner facet lines */}
    <path d="M9.5 7.5 16.5 17.5" />
    <path d="M14.5 7.5 7.5 17.5" />
  </svg>
);

/** Floating / плавающие */
export const FloatingIcon = (props: CategoryIconProps) => (
  <svg {...base} {...props} aria-hidden="true">
    {/* small flame */}
    <path d="M12 4c.8.9 1.2 1.6 1.2 2.4a1.2 1.2 0 1 1-2.4 0c0-.8.4-1.5 1.2-2.4Z" />
    <path d="M12 7.2V8.2" />
    {/* dome-shaped floating candle */}
    <path d="M7 14.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" />
    <path d="M7 14.5h10" />
    {/* water ripples */}
    <path d="M3 18c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0" />
    <path d="M3 21c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0" />
  </svg>
);
