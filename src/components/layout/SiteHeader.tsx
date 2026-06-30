import { useState } from "react";

import { Link, NavLink as RouterNavLink, useNavigate } from "react-router-dom";

import { Search, ShoppingCart, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { useCartStore } from "@/store/cartStore";

import { useAuth } from "@/hooks/useAuth";

import { cn } from "@/lib/utils";

import UserMenu from "@/components/layout/UserMenu";

import ThemeToggle from "@/components/theme-toggle";

const nav = [

  { label: "Условия опта", to: "/wholesale-terms" },

  { label: "Галерея", to: "/gallery" },

  { label: "О компании", to: "/contacts" },

];



const SiteHeader = () => {

  const navigate = useNavigate();

  const items = useCartStore((s) => s.items);

  const cartCount = items.reduce((s, i) => s + i.boxes, 0);

  useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);



  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {

    e.preventDefault();

    const data = new FormData(e.currentTarget);

    const q = (data.get("q") as string)?.trim();

    if (q) navigate(`/catalog?q=${encodeURIComponent(q)}`);

  };



  return (

    <>

    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 shadow-[0_2px_12px_-3px_rgba(0,0,0,0.12)] backdrop-blur supports-[backdrop-filter]:bg-background/70 dark:shadow-[0_2px_12px_-3px_rgba(0,0,0,0.4)]">

      <div className="container relative flex h-16 items-center gap-2 sm:h-[72px] sm:gap-4">

        <Link

          to="/"

          aria-label="На главную"

          className="group flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

        >

          <img
            src="/brand/candwax-monogram.png"
            alt=""
            aria-hidden="true"
            className="h-10 w-10 shrink-0 object-contain opacity-90 transition-transform duration-300 ease-out group-hover:scale-105 dark:invert sm:h-11 sm:w-11"
          />

          <span className="leading-none">
            <span className="block font-brand text-xl font-medium tracking-[-0.075em] text-foreground transition-colors duration-300 group-hover:text-primary sm:text-[1.65rem]">CANDWAX</span>
            <span className="mt-1 hidden text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:block">свечи для бизнеса</span>
          </span>

        </Link>

        <nav className="ml-6 hidden shrink-0 items-center gap-1 xl:flex" aria-label="Основная навигация">
          <Button asChild className="mr-2 h-11 px-6 text-sm shadow-md shadow-primary/15">
            <Link to="/catalog">Каталог</Link>
          </Button>
          {nav.map((item) => (
            <RouterNavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "rounded-full px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
              )}
            >
              {item.label}
            </RouterNavLink>
          ))}
        </nav>

        <form

          onSubmit={handleSearch}

          autoComplete="off"

          className="ml-auto hidden flex-1 max-w-sm lg:block"

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

                "h-10 w-full rounded-full border border-input bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground",

                "transition-all duration-300 ease-out",

                "hover:border-primary/40",

                "focus:border-primary/60 focus:bg-background focus:ring-4 focus:ring-primary/15",

                "[&::-webkit-search-cancel-button]:appearance-none",

              )}

            />

          </label>

        </form>



        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">

          <Button asChild className="h-10 px-4 text-sm xl:hidden sm:px-5">
            <Link to="/catalog">Каталог</Link>
          </Button>

          {/* Cart */}

          <Button asChild variant="outline" className="relative hidden gap-2 md:inline-flex">

            <Link to="/cart">

              <ShoppingCart className="h-4 w-4" />

              <span className="hidden sm:inline">Корзина</span>

              <span className="num rounded-sm bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">

                {cartCount}

              </span>

            </Link>

          </Button>



          {/* Profile — pushed to the far right corner of the header.

              Единый компонент UserMenu для публичного хедера и админки,

              чтобы UX/верстка не расходились между страницами. */}

          <ThemeToggle className="hidden lg:grid" />

          <UserMenu alwaysVisible />






          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>

            <SheetTrigger asChild>

              <Button variant="ghost" size="icon" className="h-10 w-10 lg:hidden" aria-label="Меню">

                <Menu className="h-5 w-5" />

              </Button>

            </SheetTrigger>

            <SheetContent

              side="right"

              className="w-[300px] overflow-y-auto sm:w-[360px]"

              /*

                Radix' default behaviour is to move focus to the first

                focusable element when the drawer opens — that happens to be

                the search input, which then immediately pops the mobile

                keyboard. Users opening the burger to navigate, not to

                search, find that intrusive. Cancelling the auto-focus event

                keeps focus on the trigger; Radix still traps focus inside

                the drawer once the user interacts with it.

              */

              onOpenAutoFocus={(e) => e.preventDefault()}

            >

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



              <nav className="mt-6 flex flex-col gap-1">

                <RouterNavLink
                  to="/catalog"
                  onClick={() => setMobileOpen(false)}
                  className="mb-2 flex h-12 items-center justify-center rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground"
                >
                  Перейти в каталог
                </RouterNavLink>

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



              {/* Theme switcher — simple icon toggle at the bottom of the drawer */}

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">

                <span className="text-sm text-muted-foreground">Тема оформления</span>

                <ThemeToggle />

              </div>

            </SheetContent>

          </Sheet>

        </div>

      </div>

    </header>



    {/* Floating mobile cart — sticky circle below the header */}

    <Link

      to="/cart"

      className="fixed right-4 top-[4.25rem] z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95 sm:top-[4.75rem] md:hidden"

      aria-label="Корзина"

    >

      <ShoppingCart className="h-5 w-5" />

      {cartCount > 0 && (

        <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-background text-[10px] font-bold text-primary ring-2 ring-primary">

          {cartCount}

        </span>

      )}

    </Link>

    </>

  );

};



export default SiteHeader;

