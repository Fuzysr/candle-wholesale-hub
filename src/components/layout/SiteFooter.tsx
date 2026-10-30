import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import FlaticonIcon from "@/components/ui/flaticon-icon";



type FooterLink = { label: string; to: string };



// Top candle categories, mapped to the real catalog slugs that exist in the app.

const catalogLinks: FooterLink[] = [

  { label: "Ароматические свечи", to: "/catalog/aromatic" },

  { label: "Декоративные свечи", to: "/catalog/decorative" },

  { label: "Столовые свечи", to: "/catalog/taper" },

  { label: "Чайные свечи", to: "/catalog/tealights" },

];



// Company info links. `О нас` пока ведёт на `/contacts` — отдельной страницы

// нет, заменим, когда появится.

const companyLinks: FooterLink[] = [

  { label: "О нас", to: "/contacts" },

  { label: "Условия и оплата", to: "/wholesale-terms" },

];



const SiteFooter = () => {

  const year = new Date().getFullYear();
  const [hairline, setHairline] = useState(() =>
    typeof window === "undefined" ? 1 : 1 / Math.max(window.devicePixelRatio || 1, 1),
  );

  useEffect(() => {
    const updateHairline = () => {
      setHairline(1 / Math.max(window.devicePixelRatio || 1, 1));
    };

    updateHairline();
    // Browser zoom and moving a window between monitors can change DPR.
    window.addEventListener("resize", updateHairline);
    return () => window.removeEventListener("resize", updateHairline);
  }, []);



  return (

    <footer
      className="mt-16 border-t border-border bg-surface"
      style={{ "--footer-hairline": `${hairline}px` } as CSSProperties}
    >

      <div className="container grid gap-8 py-10 sm:grid-cols-2 sm:gap-10 md:py-14 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.8fr)] lg:items-start lg:gap-10 xl:gap-16">

        {/* Brand + description */}

        <div>

          <Link

            to="/"

            aria-label="На главную"

            className="group inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"

          >

            <img
              src="/brand/candwax-wordmark.svg"
              alt=""
              aria-hidden="true"
              className="-ml-2 mt-[3px] h-[38px] w-[175px] max-w-none object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] dark:invert"
            />

          </Link>

          <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted-foreground">

            Оптовый поставщик свечей для декораторов, флористов, отелей и event-агентств.

          </p>

        </div>



        {/* Каталог */}

        <FooterColumn title="Каталог" links={catalogLinks} />



        {/* Компания */}

        <FooterColumn title="Компания" links={companyLinks} />



        {/* Контакты */}

        <div>

          <div className="eyebrow mb-4">Контакты</div>

          <ul className="space-y-3 text-sm">

            <li>

              <a

                href="tel:+78005551234"

                className="group grid min-h-8 grid-cols-[2rem_minmax(0,1fr)] items-center gap-2.5 text-muted-foreground transition-colors hover:text-primary"

              >

                <span className="grid h-8 w-8 place-items-center rounded-md bg-accent/60 text-muted-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary">

                  <FlaticonIcon name="phone-call" className="text-xs" />

                </span>

                <span className="leading-8">+7 (967) 340-13-58</span>

              </a>

            </li>

            <li>

              <a

                href="mailto:info@candwax.ru"

                className="group grid min-h-8 grid-cols-[2rem_minmax(0,1fr)] items-center gap-2.5 text-muted-foreground transition-colors hover:text-primary"

              >

                <span className="grid h-8 w-8 place-items-center rounded-md bg-accent/60 text-muted-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary">

                  <FlaticonIcon name="envelope" className="text-xs" />

                </span>

                <span className="leading-8">amoroz@mirsvechi.by</span>

              </a>

            </li>

            <li className="grid min-h-8 grid-cols-[2rem_minmax(0,1fr)] items-start gap-2.5 text-muted-foreground">

              <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-md bg-accent/60 text-muted-foreground">

                <FlaticonIcon name="marker" className="text-xs" />

              </span>

              <span className="max-w-[34rem] leading-6">МО, Одинцовский ГО, РП Новоиванковское, ул. Западная, д. 85 (М1 Сколково, Можайское шоссе) метро «Немчиновка»</span>

            </li>

          </ul>



        </div>

      </div>



      <div className="border-t border-border">

        <div className="container flex flex-col items-start justify-between gap-2 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center">

          <span>© {year} CANDWAX. Все права защищены.</span>

          <div className="flex gap-5">

            <Link

              to="/privacy"

              className="transition-colors hover:text-foreground"

            >

              Политика конфиденциальности

            </Link>

            <Link

              to="/offer"

              className="transition-colors hover:text-foreground"

            >

              Договор оферты

            </Link>

          </div>

        </div>

      </div>

    </footer>

  );

};



/** Reusable footer column with animated link hovers. */

const FooterColumn = ({ title, links }: { title: string; links: FooterLink[] }) => (

  <div>

    <div className="eyebrow mb-3">{title}</div>

    <ul className="space-y-2.5 text-sm">

      {links.map((l) => (

        <li key={l.to + l.label}>

          <Link

            to={l.to}

            className="group relative inline-flex items-center text-muted-foreground transition-colors duration-200 hover:text-primary"

          >

            <span

              aria-hidden

              className="mr-0 block h-[var(--footer-hairline)] w-0 shrink-0 self-center bg-primary transition-[width,margin] duration-300 ease-out group-hover:mr-2 group-hover:w-4"

            />

            {l.label}

          </Link>

        </li>

      ))}

    </ul>

  </div>

);




export default SiteFooter;

