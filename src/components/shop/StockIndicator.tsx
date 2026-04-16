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
  if (stockBoxes <= 5) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-warning", className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Мало: {stockBoxes} кор.
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-success", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-success" /> В наличии {stockBoxes} кор.
    </span>
  );
};

export default StockIndicator;
