import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ShoppingCart, User, Menu, Zap, LogOut, LayoutDashboard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  const [mobileOpen, setMobileOpen] = useState(false);

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
                <Button variant="ghost" size="icon" aria-label="Кабинет" className="hidden md:inline-flex">
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
            <Button asChild variant="ghost" size="icon" aria-label="Вход" className="hidden md:inline-flex">
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

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Меню">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[360px]">
              <SheetHeader>
                <SheetTitle>Меню</SheetTitle>
              </SheetHeader>

              <form
                onSubmit={(e) => {
                  handleSearch(e);
                  setMobileOpen(false);
                }}
                className="mt-4"
              >
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    name="q"
                    type="search"
                    placeholder="Поиск..."
                    className="h-10 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </form>

              <nav className="mt-6 flex flex-col gap-1">
                {nav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className="inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-foreground/90 hover:bg-accent"
                    >
                      {Icon && <Icon className="h-4 w-4 text-primary" />}
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-6 border-t border-border pt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Настройки
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrency(currency === "RUB" ? "USD" : "RUB")}
                    className="h-9 flex-1 rounded-md border border-input bg-surface text-xs font-semibold hover:bg-accent"
                  >
                    Валюта: {currency}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang(lang === "ru" ? "en" : "ru")}
                    className="h-9 flex-1 rounded-md border border-input bg-surface text-xs font-semibold uppercase hover:bg-accent"
                  >
                    Язык: {lang}
                  </button>
                </div>
              </div>

              <div className="mt-6 border-t border-border pt-4">
                {user ? (
                  <div className="flex flex-col gap-1">
                    <div className="px-3 pb-2 text-xs text-muted-foreground">
                      <div>Вы вошли как</div>
                      <div className="truncate font-medium text-foreground">
                        {user.profile?.company_name || user.user.email}
                      </div>
                    </div>
                    <Link
                      to="/account"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-md px-3 py-2.5 text-sm hover:bg-accent"
                    >
                      Мой кабинет
                    </Link>
                    {user.isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setMobileOpen(false)}
                        className="inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-accent"
                      >
                        <LayoutDashboard className="h-4 w-4" /> Админка
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await signOut();
                        setMobileOpen(false);
                        navigate("/");
                      }}
                      className="inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10"
                    >
                      <LogOut className="h-4 w-4" /> Выйти
                    </button>
                  </div>
                ) : (
                  <Button asChild className="w-full" onClick={() => setMobileOpen(false)}>
                    <Link to="/auth">Войти / Регистрация</Link>
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default SiteHeader;
