import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Trash2 } from "lucide-react";

import NumberStepper from "@/components/shop/NumberStepper";
import StockIndicator from "@/components/shop/StockIndicator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getProductImage } from "@/lib/productImages";
import {
  productName,
  productMinBoxPrice,
  productTotalStock,
  variantBoxPrice,
  variantCoverUrl,
  type Product,
  type ProductVariant,
} from "@/lib/catalog";
import { formatMoney, type Currency, type Lang } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import { useCartStore } from "@/store/cartStore";

export const FilterCard = ({
  title,
  children,
  defaultOpen = false,
  count = 0,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="overflow-hidden rounded-lg border border-border bg-surface transition-colors">
        <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left outline-none transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset data-[state=open]:bg-accent/20">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {count > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {count}
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-300",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="border-t border-border px-4 py-3">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

/**
 * Reusable min/max numeric range — used for price + dimension filters.
 * Keeps the same visual style as the original inline price inputs.
 */
export const RangeFilter = ({
  min,
  max,
  onMin,
  onMax,
  unit,
}: {
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  unit?: string;
}) => (
  <div className="flex items-center gap-2">
    <div className="flex-1">
      <input
        type="number"
        min={0}
        placeholder={unit ? `от, ${unit}` : "от"}
        value={min}
        onChange={(e) => onMin(e.target.value)}
        className="h-9 w-full min-w-0 rounded-full border border-input bg-background px-3.5 text-start text-sm tabular-nums placeholder:text-muted-foreground/60 transition-all duration-200 outline-none hover:border-primary/30 focus:border-primary/60 focus:ring-4 focus:ring-primary/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
    <span className="text-muted-foreground">—</span>
    <div className="flex-1">
      <input
        type="number"
        min={0}
        placeholder={unit ? `до, ${unit}` : "до"}
        value={max}
        onChange={(e) => onMax(e.target.value)}
        className="h-9 w-full min-w-0 rounded-full border border-input bg-background px-3.5 text-start text-sm tabular-nums placeholder:text-muted-foreground/60 transition-all duration-200 outline-none hover:border-primary/30 focus:border-primary/60 focus:ring-4 focus:ring-primary/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
  </div>
);

/** Reusable attribute checklist used inside FilterCard sections. */
export const FilterCheckList = ({
  items,
  selected,
  onToggle,
}: {
  items: { id: string; label: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) => (
  <div className="space-y-0.5">
    {items.map((it) => {
      const active = selected.has(it.id);
      return (
        <label
          key={it.id}
          className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-accent/60"
        >
          <Checkbox
            checked={active}
            onCheckedChange={() => onToggle(it.id)}
            className="border-muted-foreground/40 data-[state=checked]:border-primary"
          />
          <span className={cn(active ? "font-medium" : "text-foreground/80")}>{it.label}</span>
        </label>
      );
    })}
  </div>
);

/**
 * Product card for the grid view. When the corresponding variant is already in
 * the cart, the "+ В корзину" button is replaced with a NumberStepper bound to
 * `onSetBoxes`, plus a small trash button to remove the item (ticket #11).
 */
export const ProductCard = ({
  p,
  v,
  cartBoxes,
  currency,
  lang,
  onAdd,
  onSetBoxes,
  onRemove,
  registerRef,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  p: Product;
  v: ProductVariant;
  cartBoxes: number;
  currency: Currency;
  lang: Lang;
  onAdd: () => void;
  onSetBoxes: (n: number) => void;
  onRemove: () => void;
  registerRef?: (variantId: string, node: HTMLElement | null) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) => {
  const cover = variantCoverUrl(p, v);
  const stock = productTotalStock(p);
  const hasSizes = (p.variants?.length ?? 0) > 1;
  const productColor = v.color ?? "__none__";
  const productHref = `/product/${p.slug}?variant=${v.id}&color=${encodeURIComponent(productColor)}`;
  const inCart = cartBoxes > 0;
  const selectable = selectMode && stock > 0;

  return (
    <article
      ref={(el) => registerRef?.(v.id, el)}
      data-variant-id={v.id}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-surface transition-all duration-300 ease-out",
        stock > 0 && !selectMode
          ? "border-border hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/15"
          : stock > 0 && selectMode && selected
            ? "border-primary bg-primary/5 ring-2 ring-primary/40"
            : stock > 0
              ? "border-border hover:border-primary/40"
              : "border-border/50 opacity-60 grayscale",
      )}
    >
      {/*
        В режиме выбора весь блок карточки превращается в большой
        toggle-button через невидимый overlay поверх ссылок. Это надёжнее
        чем перехватывать клики на каждом <Link/> (карточка содержит 2-3
        ссылки на /product/...), и не ломает SEO/доступность вне режима.
      */}
      {selectable && (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed={selected}
          aria-label={selected ? "Снять выделение товара" : "Выбрать товар"}
          className="absolute inset-0 z-10 cursor-pointer"
        />
      )}

      <Link
        to={productHref}
        className="relative block aspect-[3/4] overflow-hidden bg-muted"
        aria-label={productName(p, lang)}
        tabIndex={selectable ? -1 : 0}
      >
        <img
          src={getProductImage(cover)}
          alt={productName(p, lang)}
          loading="lazy"
          className="h-full w-full bg-muted object-cover"
        />
        {inCart && !selectMode && (
          <span className="absolute right-3 top-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground shadow-md">
            В корзине · {cartBoxes}
          </span>
        )}
        {selectMode && (
          <div
            className={cn(
              "absolute left-3 top-3 z-20 grid h-7 w-7 place-items-center rounded-md border-2 shadow-sm transition-all",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-white/80 bg-background/90 text-transparent",
              stock <= 0 && "opacity-40",
            )}
          >
            <Check className="h-4 w-4" />
          </div>
        )}
      </Link>

      <div className="flex flex-col p-2.5 sm:p-3.5">
        <div className="flex items-start justify-between gap-2">
          <span className="num text-[11px] text-muted-foreground">{v.sku}</span>
          <StockIndicator stockBoxes={stock} />
        </div>
        <Link
          to={productHref}
          className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-foreground transition-colors hover:text-primary"
        >
          {productName(p, lang)}
        </Link>
        <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
          {v.color || "Без цвета"}{hasSizes ? ` · ${p.variants.length} размера` : v.size ? ` · ${v.size}` : ""}
        </div>

        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <div className="price text-base font-bold sm:text-lg">
              {hasSizes && <span className="mr-1 text-xs font-normal text-muted-foreground">от</span>}
              {formatMoney(productMinBoxPrice(p, currency), currency)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {hasSizes ? "за коробку · выберите размер" : `за коробку · ${v.pieces_per_box} шт`}
            </div>
          </div>
        </div>

        {/* Volume-discount mini-table — only when product has tiered pricing,
            mirrors the rucandle.ru pattern where buyers see the price-by-volume
            ladder directly in the grid without opening the product page. */}
        {!hasSizes && v.volume_discounts && v.volume_discounts.length > 0 && (() => {
          const base = variantBoxPrice(v, currency);
          const tiers = [...v.volume_discounts]
            .sort((a, b) => a.min_boxes - b.min_boxes)
            .slice(0, 4);
          return (
            <div className="mt-2 grid grid-cols-1 gap-1 rounded-md border border-amber/30 bg-amber/5 p-1.5 text-[10px] sm:grid-cols-2 sm:text-[11px]">
              {tiers.map((vd) => {
                const after = Math.round(base * (1 - Number(vd.discount_percent) / 100));
                return (
                  <div key={vd.id ?? `${vd.min_boxes}-${vd.discount_percent}`} className="flex items-baseline justify-between gap-1 px-1 leading-tight whitespace-nowrap">
                    <span className="num text-muted-foreground">от {vd.min_boxes} кор</span>
                    <span className="price font-semibold text-amber">{formatMoney(after, currency)}</span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Cart-aware CTA: stepper while in cart, add button otherwise.
            В selectMode CTA визуально приглушаем — клики всё равно
            перехватываются overlay-button выше и должны переключать
            выбор, а не добавлять в корзину. */}
        <div
          className={cn(
            "mt-2 sm:mt-3",
            selectMode && "pointer-events-none opacity-50",
          )}
          aria-hidden={selectMode}
        >
          {inCart ? (
            <div className="flex items-stretch gap-2">
              <NumberStepper
                value={cartBoxes}
                onChange={onSetBoxes}
                min={1}
                max={stock}
                size="sm"
                block
                className="flex-1"
              />
              <button
                type="button"
                onClick={onRemove}
                aria-label="Убрать из корзины"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-destructive/30 text-destructive transition-colors hover:bg-destructive/10 hover:border-destructive/50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            hasSizes && stock > 0 ? (
              <Button asChild className="w-full transition-all duration-200 hover:shadow-md hover:shadow-primary/25">
                <Link to={productHref}>Выбрать размер</Link>
              </Button>
            ) : (
              <Button
                onClick={onAdd}
                disabled={stock <= 0}
                className="w-full transition-all duration-200 hover:shadow-md hover:shadow-primary/25"
              >
                {stock > 0 ? "+ В корзину" : "Нет в наличии"}
              </Button>
            )
          )}
        </div>
      </div>
    </article>
  );
};

/**
 * Mobile list-row — compact horizontal card for the "table" view on phones.
 * Small image left, info right, fits the viewport without horizontal scroll.
 */
export const MobileListRow = ({
  p,
  v,
  onAdd,
  index = 0,
  registerRef,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  p: Product;
  v: ProductVariant;
  onAdd: (p: Product, v: ProductVariant, n: number) => void;
  index?: number;
  registerRef?: (variantId: string, node: HTMLElement | null) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) => {
  const { currency, lang } = useAppStore();
  const cartItem = useCartStore((s) => s.items.find((i) => i.variantId === v.id));
  const setCartBoxes = useCartStore((s) => s.setBoxes);
  const removeFromCart = useCartStore((s) => s.remove);
  const stock = productTotalStock(p);
  const hasSizes = (p.variants?.length ?? 0) > 1;
  const cover = variantCoverUrl(p, v);
  const productColor = v.color ?? "__none__";
  const productHref = `/product/${p.slug}?variant=${v.id}&color=${encodeURIComponent(productColor)}`;
  const inCart = Boolean(cartItem);
  const delayMs = Math.min(index, 13) * 20;
  const selectable = selectMode && stock > 0;

  return (
    <div
      ref={(el) => registerRef?.(v.id, el)}
      data-variant-id={v.id}
      className={cn(
        "relative flex gap-3 p-3 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-500 ease-out",
        stock <= 0 && "opacity-60 grayscale",
        selected && "bg-primary/5",
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {/* Overlay toggle для batch-выбора — см. ProductCard. */}
      {selectable && (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed={selected}
          aria-label={selected ? "Снять выделение товара" : "Выбрать товар"}
          className="absolute inset-0 z-10 cursor-pointer"
        />
      )}
      {selectMode && (
        <div
          className={cn(
            "absolute left-2 top-2 z-20 grid h-6 w-6 place-items-center rounded-md border-2 shadow-sm transition-all",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-white/80 bg-background/90 text-transparent",
            stock <= 0 && "opacity-40",
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </div>
      )}
      <Link
        to={productHref}
        className="block aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
        aria-label={productName(p, lang)}
        tabIndex={selectable ? -1 : 0}
      >
        <img
          src={getProductImage(cover)}
          alt={productName(p, lang)}
          loading="lazy"
          className="h-full w-full bg-muted object-cover"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="price text-base font-bold">
          {hasSizes && <span className="mr-1 text-xs font-normal text-muted-foreground">от</span>}
          {formatMoney(productMinBoxPrice(p, currency), currency)}
        </div>
        <Link
          to={productHref}
          className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors hover:text-primary"
        >
          {productName(p, lang)}
        </Link>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {v.color || "Без цвета"}{hasSizes ? ` · ${p.variants.length} размера` : ` · ${v.size || ""} · ${v.pieces_per_box} шт/кор`}
        </div>

        <div
          className={cn(
            "mt-auto flex items-center gap-2 pt-1.5",
            selectMode && "pointer-events-none opacity-50",
          )}
          aria-hidden={selectMode}
        >
          {inCart ? (
            <div className="flex flex-1 items-center gap-1.5">
              <NumberStepper
                value={cartItem!.boxes}
                onChange={(n) => setCartBoxes(v.id, n)}
                min={1}
                max={stock}
                size="sm"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeFromCart(v.id)}
                aria-label="Убрать из корзины"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : hasSizes && stock > 0 ? (
            <Button asChild size="sm" className="h-8 text-xs"><Link to={productHref}>Выбрать размер</Link></Button>
          ) : (
            <Button size="sm" className="h-8 text-xs" onClick={() => onAdd(p, v, 1)} disabled={stock <= 0}>
              {stock > 0 ? "В корзину" : "Нет"}
            </Button>
          )}
          <StockIndicator stockBoxes={stock} />
        </div>
      </div>
    </div>
  );
};

/**
 * Table row — now includes a thumbnail (ticket #7) and becomes cart-aware:
 * the quantity stepper is bound to the cart entry and the CTA flips to
 * "Убрать" once the variant is already in the cart.
 *
 * `index` is used to stagger the row's reveal animation so the table feels as
 * lively as the grid view.
 */
export const TableRow = ({
  p,
  v,
  onAdd,
  index = 0,
  registerRef,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  p: Product;
  v: ProductVariant;
  onAdd: (p: Product, v: ProductVariant, n: number) => void;
  index?: number;
  registerRef?: (variantId: string, node: HTMLElement | null) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) => {
  const { currency, lang } = useAppStore();
  const cartItem = useCartStore((s) => s.items.find((i) => i.variantId === v.id));
  const setCartBoxes = useCartStore((s) => s.setBoxes);
  const removeFromCart = useCartStore((s) => s.remove);
  const [qty, setQty] = useState(1);
  const stock = productTotalStock(p);
  const hasSizes = (p.variants?.length ?? 0) > 1;
  const cover = variantCoverUrl(p, v);
  const productColor = v.color ?? "__none__";
  const productHref = `/product/${p.slug}?variant=${v.id}&color=${encodeURIComponent(productColor)}`;
  const inCart = Boolean(cartItem);
  const delayMs = Math.min(index, 13) * 20;
  const selectable = selectMode && stock > 0;

  return (
    <div
      ref={(el) => registerRef?.(v.id, el)}
      data-variant-id={v.id}
      className={cn(
        "relative flex items-center gap-5 px-4 py-4 transition-colors hover:bg-accent/30 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-500 ease-out",
        stock <= 0 && "opacity-60 grayscale",
        selected && "bg-primary/5",
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {/* Overlay toggle for batch-выбора (см. ProductCard). */}
      {selectable && (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed={selected}
          aria-label={selected ? "Снять выделение товара" : "Выбрать товар"}
          className="absolute inset-0 z-10 cursor-pointer"
        />
      )}
      {selectMode && (
        <div
          className={cn(
            "z-20 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-all",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40 bg-background text-transparent",
            stock <= 0 && "opacity-40",
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </div>
      )}
      {/* Thumbnail */}
      <Link
        to={productHref}
        className="block aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
        aria-label={productName(p, lang)}
        tabIndex={selectable ? -1 : 0}
      >
        <img
          src={getProductImage(cover)}
          alt={productName(p, lang)}
          loading="lazy"
          className="h-full w-full bg-muted object-cover"
        />
      </Link>

      {/* Info — middle */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="text-lg font-bold">
          {hasSizes && <span className="mr-1 text-xs font-normal text-muted-foreground">от</span>}
          {formatMoney(productMinBoxPrice(p, currency), currency)}
        </div>
        <Link
          to={productHref}
          className="line-clamp-1 text-sm font-medium text-foreground transition-colors hover:text-primary"
        >
          {productName(p, lang)}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{v.color || "Без цвета"}{hasSizes ? ` · ${p.variants.length} размера` : v.size ? ` · ${v.size}` : ""}</span>
          <span>·</span>
          <span>{v.pieces_per_box} шт/кор</span>
          <span>·</span>
          <span className="num">{v.sku}</span>
          <span>·</span>
          <StockIndicator stockBoxes={stock} />
        </div>
      </div>

      {/* Actions — right side. В selectMode CTA приглушается, клики
          съедает overlay-button сверху. */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-3",
          selectMode && "pointer-events-none opacity-50",
        )}
        aria-hidden={selectMode}
      >
        {inCart ? (
          <>
            <NumberStepper
              value={cartItem!.boxes}
              onChange={(n) => setCartBoxes(v.id, n)}
              min={1}
              max={stock}
              size="sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => removeFromCart(v.id)}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Убрать
            </Button>
          </>
        ) : hasSizes && stock > 0 ? (
          <Button asChild size="sm"><Link to={productHref}>Выбрать размер</Link></Button>
        ) : (
          <>
            {stock > 0 && <NumberStepper value={qty} onChange={setQty} min={1} max={stock} size="sm" />}
            <Button size="sm" onClick={() => onAdd(p, v, qty)} disabled={stock <= 0}>
              {stock > 0 ? "В корзину" : "Нет в наличии"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
