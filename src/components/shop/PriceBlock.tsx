import { formatMoney, type Currency } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  pricePerPiece: number;
  piecesPerBox: number;
  currency: Currency;
  className?: string;
  align?: "left" | "right";
};

const PriceBlock = ({ pricePerPiece, piecesPerBox, currency, className, align = "left" }: Props) => {
  const boxPrice = pricePerPiece * piecesPerBox;
  return (
    <div className={cn(align === "right" ? "text-right" : "text-left", className)}>
      <div className="price text-base">{formatMoney(boxPrice, currency)}<span className="ml-1 text-xs font-normal text-muted-foreground">/ кор</span></div>
      <div className="text-xs text-muted-foreground">
        {formatMoney(pricePerPiece, currency)} × {piecesPerBox} шт
      </div>
    </div>
  );
};

export default PriceBlock;
