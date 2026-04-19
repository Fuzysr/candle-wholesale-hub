import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  className?: string;
  size?: "sm" | "md";
  /**
   * When true the stepper switches from `inline-flex` (intrinsic width) to
   * `flex w-full` and the central input grows with `flex-1`. Use this when
   * the stepper sits in a row with another control (e.g. the trash button on
   * the catalog ProductCard) and needs to fill the remaining space.
   */
  block?: boolean;
};

const NumberStepper = ({
  value,
  onChange,
  min = 1,
  max = 9999,
  className,
  size = "md",
  block = false,
}: Props) => {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const isSm = size === "sm";
  const h = isSm ? "h-9" : "h-10";
  const btnW = isSm ? "w-9" : "w-10";
  const inputW = isSm ? "w-10" : "w-12";
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <div
      className={cn(
        "items-stretch divide-x divide-input overflow-hidden rounded-md border border-input bg-background transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20",
        block ? "flex w-full" : "inline-flex",
        h,
        className,
      )}
    >
      <button
        type="button"
        onClick={dec}
        disabled={atMin}
        aria-label="Уменьшить"
        className={cn(
          "flex items-center justify-center text-muted-foreground transition-colors",
          "enabled:hover:bg-accent enabled:hover:text-foreground enabled:active:bg-accent/70",
          "disabled:opacity-40",
          btnW,
        )}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value || "0", 10);
          if (Number.isNaN(n)) return;
          onChange(Math.max(min, Math.min(max, n)));
        }}
        aria-label="Количество"
        className={cn(
          "bg-transparent text-center text-sm font-semibold tabular-nums text-foreground outline-none",
          // Hide native number spinners for a clean look on all browsers
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0",
          // Block mode: input flexes to fill space; intrinsic mode uses fixed width
          block ? "min-w-0 flex-1" : inputW,
        )}
      />
      <button
        type="button"
        onClick={inc}
        disabled={atMax}
        aria-label="Увеличить"
        className={cn(
          "flex items-center justify-center text-muted-foreground transition-colors",
          "enabled:hover:bg-accent enabled:hover:text-foreground enabled:active:bg-accent/70",
          "disabled:opacity-40",
          btnW,
        )}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default NumberStepper;
