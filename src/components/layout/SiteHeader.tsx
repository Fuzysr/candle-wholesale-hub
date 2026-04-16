import { Link } from "react-router-dom";
import { Search, ShoppingCart, User, Menu, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const nav = [
  { label: "Каталог", to: "/catalog" },
  { label: "Быстрый заказ", to: "/quick-order", icon: Zap },
  { label: "Условия опта", to: "/wholesale-terms" },
  { label: "Контакты", to: "/contacts" },
];

const SiteHeader = () => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-16 items-center gap-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-foreground text-background text-sm font-bold">
            WC
          </span>
          <span className="hidden font-semibold tracking-tight md:inline">
            Wholesale<span className="text-primary">.</span>Candles
          </span>
        </Link>

        {/* Nav */}
        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
              >
                {Icon && <Icon className="h-4 w-4 text-primary" />}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Search */}
        <div className="ml-auto hidden flex-1 max-w-sm md:block">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Поиск по артикулу или названию"
              className="h-10 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <button
            type="button"
            className="hidden h-9 items-center gap-1 rounded-md border border-input bg-surface px-2.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-accent md:inline-flex"
            aria-label="Валюта"
          >
            RUB
          </button>
          <button
            type="button"
            className="hidden h-9 items-center gap-1 rounded-md border border-input bg-surface px-2.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-accent md:inline-flex"
            aria-label="Язык"
          >
            RU
          </button>

          <Button asChild variant="ghost" size="icon" aria-label="Личный кабинет">
            <Link to="/account">
              <User className="h-5 w-5" />
            </Link>
          </Button>

          <Button asChild variant="default" className="relative gap-2">
            <Link to="/cart">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Корзина</span>
              <span className="num rounded-sm bg-primary-foreground/15 px-1.5 py-0.5 text-xs font-semibold">
                0
              </span>
            </Link>
          </Button>

          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Меню">
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default SiteHeader;
