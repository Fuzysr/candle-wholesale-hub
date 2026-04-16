import { computeDiscount, nextDiscountTier, type DiscountTier } from "@/lib/catalog";

type Props = { totalBoxes: number; tiers: DiscountTier[] };

const DiscountProgressBar = ({ totalBoxes, tiers }: Props) => {
  const current = computeDiscount(totalBoxes, tiers);
  const next = nextDiscountTier(totalBoxes, tiers);
  const sortedTiers = [...tiers].sort((a, b) => a.min_boxes - b.min_boxes);
  const maxBoxes = sortedTiers[sortedTiers.length - 1]?.min_boxes ?? 1;
  const progress = Math.min(100, (totalBoxes / maxBoxes) * 100);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Скидка по объёму
        </span>
        <span className="price text-lg text-primary">−{current}%</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        {sortedTiers.map((t) => (
          <span key={t.min_boxes} className={totalBoxes >= t.min_boxes ? "text-primary font-semibold" : ""}>
            {t.min_boxes}+ → {t.discount_percent}%
          </span>
        ))}
      </div>
      {next && (
        <p className="mt-3 text-xs text-foreground/80">
          Добавьте ещё <span className="price text-foreground">{next.min_boxes - totalBoxes}</span> кор. — скидка вырастет до{" "}
          <span className="price text-primary">{next.discount_percent}%</span>
        </p>
      )}
    </div>
  );
};

export default DiscountProgressBar;
