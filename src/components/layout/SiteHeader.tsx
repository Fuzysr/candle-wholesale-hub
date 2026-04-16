import { Link, useNavigate } from "react-router-dom";
import { Search, ShoppingCart, User, Menu, Zap, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/cartStore";
import { useAppStore } from "@/store/appStore";
import { useAuth, signOut } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const nav = [
  { label: "Каталог", to: "/catalog" },
  { label: "Быстрый заказ", to: "/quick-order", icon: Zap },
  { label: "Условия опта", to: "/wholesale-terms" },
  { label: "Контакты", to: "/contacts" },
];

const SiteHeader = () => {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const cartCount = items.reduce((s, i) => s + i.boxes, 0);
  const { currency, lang, setCurrency, setLang } = useAppStore();
  const { user } = useAuth();

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const q = (data.get("q") as string)?.trim();
    if (q) navigate(`/catalog?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-16 items-center gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-foreground text-background text-sm font-bold">
            WC
          </span>
          <span className="hidden font-semibold tracking-tight md:inline">
            Wholesale<span className="text-primary">.</span>Candles
          </span>
        </Link>

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

        <form onSubmit={handleSearch} className="ml-auto hidden flex-1 max-w-sm md:block">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              type="search"
              placeholder="Поиск по артикулу или названию"
              className="h-10 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <button
            type="button"
            onClick={() => setCurrency(currency === "RUB" ? "USD" : "RUB")}
            className="hidden h-9 items-center gap-1 rounded-md border border-input bg-surface px-2.5 text-xs font-semibold text-foreground/80 transition-colors hover:bg-accent md:inline-flex"
            aria-label="Валюта"
          >
            {currency}
          </button>
          <button
            type="button"
            onClick={() => setLang(lang === "ru" ? "en" : "ru")}
            className="hidden h-9 items-center gap-1 rounded-md border border-input bg-surface px-2.5 text-xs font-semibold uppercase text-foreground/80 transition-colors hover:bg-accent md:inline-flex"
            aria-label="Язык"
          >
            {lang}
          </button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Кабинет">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-xs font-normal text-muted-foreground">Вы вошли как</div>
                  <div className="truncate">{user.profile?.company_name || user.user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/account">Мой кабинет</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/account/orders">Мои заявки</Link>
                </DropdownMenuItem>
                {user.isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="flex items-center gap-2">
                        <LayoutDashboard className="h-4 w-4" /> Админка
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    navigate("/");
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" /> Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="ghost" size="icon" aria-label="Вход">
              <Link to="/auth">
                <User className="h-5 w-5" />
              </Link>
            </Button>
          )}

          <Button asChild variant="default" className="relative gap-2">
            <Link to="/cart">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Корзина</span>
              <span className="num rounded-sm bg-primary-foreground/15 px-1.5 py-0.5 text-xs font-semibold">
                {cartCount}
              </span>
            </Link>
          </Button>

          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Меню" asChild>
            <Link to="/catalog">
              <Menu className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
};

export default SiteHeader;
