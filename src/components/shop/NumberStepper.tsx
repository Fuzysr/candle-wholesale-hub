import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  className?: string;
  size?: "sm" | "md";
};

const NumberStepper = ({ value, onChange, min = 1, max = 9999, className, size = "md" }: Props) => {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const h = size === "sm" ? "h-8" : "h-10";
  const w = size === "sm" ? "w-12" : "w-14";

  return (
    <div className={cn("inline-flex items-stretch overflow-hidden rounded-md border border-input bg-surface", h, className)}>
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        className="grid w-9 place-items-center text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
        aria-label="Уменьшить"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value || "0", 10);
          if (Number.isNaN(n)) return;
          onChange(Math.max(min, Math.min(max, n)));
        }}
        className={cn("border-x border-border bg-transparent text-center text-sm font-semibold tabular-nums focus:outline-none", w)}
      />
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        className="grid w-9 place-items-center text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
        aria-label="Увеличить"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default NumberStepper;
