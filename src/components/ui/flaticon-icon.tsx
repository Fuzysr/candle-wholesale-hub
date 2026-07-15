import { cn } from "@/lib/utils";

type FlaticonIconProps = {
  name: string;
  className?: string;
  brand?: boolean;
};

/**
 * Flaticon UIcons are rendered through the official icon webfont, so shared
 * navigation icons don't inject a separate SVG tree for every occurrence.
 */
const FlaticonIcon = ({ name, className, brand = false }: FlaticonIconProps) => (
  <i
    aria-hidden="true"
    className={cn(
      "inline-flex shrink-0 items-center justify-center leading-none",
      brand ? `fi fi-brands-${name}` : `fi fi-rr-${name}`,
      className,
    )}
  />
);

export default FlaticonIcon;
