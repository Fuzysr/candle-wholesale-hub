import { useState } from "react";

import { Link, NavLink as RouterNavLink, useNavigate } from "react-router-dom";

import {

  Search,

  ShoppingCart,

  Menu,

  Zap,

} from "lucide-react";

import { Button } from "@/components/ui/button";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { useCartStore } from "@/store/cartStore";

import { useAuth } from "@/hooks/useAuth";

import { cn } from "@/lib/utils";

import UserMenu from "@/components/layout/UserMenu";

import ThemeToggle from "@/components/theme-toggle";

import { LightningBorder } from "@/components/ui/lightning-border";



// Top-level navigation. "Быстрый заказ" intentionally lives outside this list —

// it is rendered as a standalone highlighted CTA in the action zone.

const nav = [

  { label: "Каталог", to: "/catalog" },

  { label: "Условия опта", to: "/wholesale-terms" },

  { label: "Галерея", to: "/gallery" },

  { label: "Контакты", to: "/contacts" },

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

      <div className="container relative flex h-14 items-center gap-2 sm:h-16 sm:gap-4">

        <Link

          to="/"

          aria-label="На главную"

          className="group flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

        >

          <span className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-md bg-foreground text-background text-sm font-bold shadow-sm transition-all duration-300 ease-out group-hover:-rotate-[4deg] group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md group-hover:shadow-primary/35 group-active:scale-95">

            <span className="relative z-10">CW</span>

            <span

              aria-hidden

              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-500 ease-out group-hover:translate-x-full"

            />

          </span>

          <span className="text-xs font-semibold tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary sm:text-base">

            CANDWAX

          </span>

        </Link>






        <form

          onSubmit={handleSearch}

          autoComplete="off"

          className="ml-auto hidden flex-1 max-w-md lg:block"

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

          {/* FROZEN: Quick Order feature temporarily hidden */}

          {false && (

            <>

            <Button

              asChild

              variant="outline"

              size="icon"

              className="h-9 w-9 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary md:hidden"

            >

              <Link to="/quick-order" aria-label="Быстрый заказ">

                <Zap className="h-4 w-4" />

              </Link>

            </Button>



            <LightningBorder className="hidden hover:-translate-y-0.5 transition-transform duration-300 md:inline-flex">

              <Button

                asChild

                className="group relative gap-2 shadow-md shadow-primary/25 ring-1 ring-primary/40 hover:shadow-lg hover:shadow-primary/40 transition-shadow duration-300"

              >

                <Link to="/quick-order">

                  <Zap className="h-4 w-4 transition-transform group-hover:scale-110" />

                  Быстрый заказ

                </Link>

              </Button>

            </LightningBorder>

            </>

          )}



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



              {/* FROZEN: Quick Order feature temporarily hidden */}

              {false && (

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

              )}



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

