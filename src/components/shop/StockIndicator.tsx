import { cn } from "@/lib/utils";

type Props = { stockBoxes: number; className?: string };

const StockIndicator = ({ stockBoxes, className }: Props) => {
  if (stockBoxes <= 0) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-destructive", className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> Нет в наличии
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-success", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-success" /> Имеется в наличии
    </span>
  );
};

export default StockIndicator;
