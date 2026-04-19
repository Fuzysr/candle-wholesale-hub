import { useState } from "react";
import { Link, NavLink as RouterNavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Search,
  ShoppingCart,
  User,
  Menu,
  Zap,
  LogOut,
  LayoutDashboard,
  Receipt,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useCartStore } from "@/store/cartStore";
import { useAuth, signOut } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ThemeToggle from "@/components/theme-toggle";

// Top-level navigation. "Быстрый заказ" intentionally lives outside this list —
// it is rendered as a standalone highlighted CTA in the action zone.
const nav = [
  { label: "Каталог", to: "/catalog" },
  { label: "Условия опта", to: "/wholesale-terms" },
  { label: "Контакты", to: "/contacts" },
];

/** Pick up to two readable initials from the user's company name or email. */
const getInitials = (name?: string | null, email?: string | null) => {
  const source = (name?.trim() || email?.split("@")[0] || "").replace(/[^\p{L}\p{N}\s]/gu, " ");
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const SiteHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const items = useCartStore((s) => s.items);
  const cartCount = items.reduce((s, i) => s + i.boxes, 0);
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // "Profile area" covers the account routes and (for admins) the admin panel.
  const isProfileActive =
    location.pathname.startsWith("/account") || location.pathname.startsWith("/admin");
  const isAccountActive = location.pathname.startsWith("/account") && !location.pathname.startsWith("/account/orders");
  const isOrdersActive = location.pathname.startsWith("/account/orders");
  const isAdminActive = location.pathname.startsWith("/admin");

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const q = (data.get("q") as string)?.trim();
    if (q) navigate(`/catalog?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-16 items-center gap-4">
        <Link
          to="/"
          aria-label="На главную"
          className="group flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-md bg-foreground text-background text-sm font-bold shadow-sm transition-all duration-300 ease-out group-hover:-rotate-[4deg] group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md group-hover:shadow-primary/35 group-active:scale-95">
            <span className="relative z-10">WC</span>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-500 ease-out group-hover:translate-x-full"
            />
          </span>
          <span className="hidden font-semibold tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary md:inline">
            Wholesale
            <span className="text-primary transition-all duration-300 group-hover:inline-block group-hover:scale-125">
              .
            </span>
            <span className="text-foreground transition-colors duration-300 group-hover:text-primary">
              Candles
            </span>
          </span>
        </Link>

        {/* Desktop nav — plain links, active-route indicator, no mega-menu */}
        <nav className="hidden items-center gap-0.5 lg:flex">
          {nav.map((item) => (
            <RouterNavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "group relative inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200",
                  isActive
                    ? "text-foreground"
                    : "text-foreground/70 hover:bg-accent/70 hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative z-10">{item.label}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-x-3 -bottom-px h-0.5 origin-center rounded-full bg-primary transition-all duration-300 ease-out",
                      isActive
                        ? "scale-x-100 opacity-100"
                        : "scale-x-0 opacity-0 group-hover:scale-x-50 group-hover:opacity-60",
                    )}
                  />
                </>
              )}
            </RouterNavLink>
          ))}
        </nav>

        <form
          onSubmit={handleSearch}
          autoComplete="off"
          className="ml-auto hidden flex-1 max-w-sm md:block"
        >
          <label className="group relative block">
            <Search
              className={cn(
                "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-all duration-300 ease-out",
                "group-focus-within:scale-110 group-focus-within:text-primary",
              )}
            />
            <input
              name="q"
              type="search"
              placeholder="Поиск по артикулу или названию"
              // Suppress the browser's past-search history dropdown — it
              // covers the page content on focus and isn't useful here.
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className={cn(
                "h-10 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground",
                "transition-all duration-300 ease-out",
                "hover:border-primary/40",
                "focus:border-primary/60 focus:bg-background focus:ring-4 focus:ring-primary/15",
                "[&::-webkit-search-cancel-button]:appearance-none",
              )}
            />
          </label>
        </form>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {/* Highlighted Quick Order CTA — stands out, always visible on md+ */}
          <Button
            asChild
            className="group relative hidden gap-2 shadow-md shadow-primary/25 ring-1 ring-primary/40 hover:shadow-lg hover:shadow-primary/40 md:inline-flex"
          >
            <Link to="/quick-order">
              <Zap className="h-4 w-4 transition-transform group-hover:scale-110" />
              Быстрый заказ
            </Link>
          </Button>

          {/* Cart */}
          <Button asChild variant="outline" className="relative gap-2">
            <Link to="/cart">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Корзина</span>
              <span className="num rounded-sm bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
                {cartCount}
              </span>
            </Link>
          </Button>

          {/* Profile — pushed to the far right corner of the header */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Кабинет"
                  className={cn(
                    "group relative hidden h-10 w-10 shrink-0 place-items-center rounded-md transition-all duration-200 ease-out md:grid",
                    "hover:bg-accent/70 hover:text-foreground hover:shadow-sm",
                    "data-[state=open]:bg-accent data-[state=open]:text-foreground data-[state=open]:ring-1 data-[state=open]:ring-primary/30",
                    // tighter, subtler focus-visible (overrides the global ring-2 + ring-offset-2)
                    "focus-visible:outline-none focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0",
                    isProfileActive ? "text-foreground" : "text-foreground/70",
                  )}
                >
                  <User className="h-5 w-5 transition-transform duration-300 group-hover:scale-110 group-data-[state=open]:scale-110" />
                  {/* Active-page dot (mirrors the nav underline style) */}
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary transition-all duration-300",
                      isProfileActive ? "scale-100 opacity-100" : "scale-0 opacity-0 group-hover:scale-75 group-hover:opacity-60",
                    )}
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={10}
                className={cn(
                  "w-72 overflow-hidden rounded-xl border-border/70 p-0 shadow-lg",
                  "data-[state=open]:duration-[220ms] data-[state=closed]:duration-150",
                )}
              >
                {/* Header card with avatar */}
                <div className="relative overflow-hidden bg-gradient-to-br from-primary/18 via-primary/6 to-transparent p-4">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/15 blur-2xl"
                  />
                  <div className="relative flex items-center gap-3">
                    <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-semibold tracking-wide shadow-sm shadow-primary/30 ring-2 ring-popover">
                      {getInitials(user.profile?.company_name || user.profile?.contact_name, user.profile?.email || user.user.email)}
                      <span
                        aria-hidden
                        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-popover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Вы вошли как
                      </div>
                      <div className="truncate text-sm font-semibold text-foreground">
                        {user.profile?.company_name || user.profile?.contact_name || user.user.email}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {user.profile?.email || user.user.email}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="p-1.5">
                  <DropdownMenuItem asChild className="group/item rounded-lg p-0 focus:bg-transparent">
                    <Link
                      to="/account"
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        isAccountActive
                          ? "bg-accent text-foreground"
                          : "text-foreground/85 hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-8 w-8 place-items-center rounded-md transition-colors",
                          isAccountActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground group-hover/item:bg-primary/15 group-hover/item:text-primary",
                        )}
                      >
                        <User className="h-4 w-4" />
                      </span>
                      <span className="flex-1 font-medium">Мой кабинет</span>
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 transition-all",
                          isAccountActive
                            ? "translate-x-0 text-primary opacity-100"
                            : "-translate-x-1 text-muted-foreground opacity-0 group-hover/item:translate-x-0 group-hover/item:opacity-100",
                        )}
                      />
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild className="group/item rounded-lg p-0 focus:bg-transparent">
                    <Link
                      to="/account/orders"
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        isOrdersActive
                          ? "bg-accent text-foreground"
                          : "text-foreground/85 hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-8 w-8 place-items-center rounded-md transition-colors",
                          isOrdersActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground group-hover/item:bg-primary/15 group-hover/item:text-primary",
                        )}
                      >
                        <Receipt className="h-4 w-4" />
                      </span>
                      <span className="flex-1 font-medium">Мои заявки</span>
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 transition-all",
                          isOrdersActive
                            ? "translate-x-0 text-primary opacity-100"
                            : "-translate-x-1 text-muted-foreground opacity-0 group-hover/item:translate-x-0 group-hover/item:opacity-100",
                        )}
                      />
                    </Link>
                  </DropdownMenuItem>

                  {user.isAdmin && (
                    <DropdownMenuItem asChild className="group/item rounded-lg p-0 focus:bg-transparent">
                      <Link
                        to="/admin"
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                          isAdminActive
                            ? "bg-accent text-foreground"
                            : "text-foreground/85 hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-8 w-8 place-items-center rounded-md transition-colors",
                            isAdminActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground group-hover/item:bg-primary/15 group-hover/item:text-primary",
                          )}
                        >
                          <LayoutDashboard className="h-4 w-4" />
                        </span>
                        <span className="flex-1 font-medium">Админка</span>
                        <ChevronRight
                          className={cn(
                            "h-3.5 w-3.5 transition-all",
                            isAdminActive
                              ? "translate-x-0 text-primary opacity-100"
                              : "-translate-x-1 text-muted-foreground opacity-0 group-hover/item:translate-x-0 group-hover/item:opacity-100",
                          )}
                        />
                      </Link>
                    </DropdownMenuItem>
                  )}
                </div>

                {/* Theme switcher — visible segmented control */}
                <div className="border-t border-border/70 px-3 py-3">
                  <ThemeToggle />
                </div>

                {/* Sign out */}
                <div className="border-t border-border/70 bg-muted/30 p-1.5">
                  <DropdownMenuItem
                    onClick={async () => {
                      await signOut();
                      navigate("/");
                    }}
                    className="group/item flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-destructive transition-colors focus:bg-destructive/10 focus:text-destructive"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-destructive/10 text-destructive transition-colors group-hover/item:bg-destructive group-hover/item:text-destructive-foreground">
                      <LogOut className="h-4 w-4" />
                    </span>
                    <span className="flex-1 font-medium">Выйти</span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <RouterNavLink
              to="/auth"
              aria-label="Вход"
              className={({ isActive }) =>
                cn(
                  "group relative hidden h-10 w-10 shrink-0 place-items-center rounded-md transition-all duration-200 ease-out md:grid",
                  "hover:bg-accent/70 hover:text-foreground hover:shadow-sm",
                  "focus-visible:outline-none focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0",
                  isActive ? "text-foreground" : "text-foreground/70",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <User className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary transition-all duration-300",
                      isActive ? "scale-100 opacity-100" : "scale-0 opacity-0 group-hover:scale-75 group-hover:opacity-60",
                    )}
                  />
                </>
              )}
            </RouterNavLink>
          )}

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Меню">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] overflow-y-auto sm:w-[360px]">
              <SheetHeader>
                <SheetTitle>Меню</SheetTitle>
              </SheetHeader>

              <form
                onSubmit={(e) => {
                  handleSearch(e);
                  setMobileOpen(false);
                }}
                autoComplete="off"
                className="mt-4"
              >
                <label className="group relative block">
                  <Search
                    className={cn(
                      "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-all duration-300 ease-out",
                      "group-focus-within:scale-110 group-focus-within:text-primary",
                    )}
                  />
                  <input
                    name="q"
                    type="search"
                    placeholder="Поиск..."
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className={cn(
                      "h-10 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground",
                      "transition-all duration-300 ease-out",
                      "hover:border-primary/40",
                      "focus:border-primary/60 focus:bg-background focus:ring-4 focus:ring-primary/15",
                      "[&::-webkit-search-cancel-button]:appearance-none",
                    )}
                  />
                </label>
              </form>

              {/* Highlighted Quick Order CTA — top of the mobile drawer */}
              <Button
                asChild
                className="mt-4 w-full justify-center gap-2 shadow-md shadow-primary/25 ring-1 ring-primary/40"
                onClick={() => setMobileOpen(false)}
              >
                <Link to="/quick-order">
                  <Zap className="h-4 w-4" />
                  Быстрый заказ
                </Link>
              </Button>

              <nav className="mt-6 flex flex-col gap-1">
                {nav.map((item) => (
                  <RouterNavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "relative rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-accent text-foreground"
                          : "text-foreground/85 hover:bg-accent hover:text-foreground",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary"
                          />
                        )}
                        {item.label}
                      </>
                    )}
                  </RouterNavLink>
                ))}
              </nav>

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

              {/* Theme switcher — also available when signed out, pinned at the
                  bottom of the drawer for easy reach on mobile. */}
              <div className="mt-4 border-t border-border pt-4">
                <ThemeToggle />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default SiteHeader;
