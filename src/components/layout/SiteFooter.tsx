import { Link } from "react-router-dom";

import { Mail, Phone, MapPin, Send, MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";



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

  { label: "Галерея", to: "/gallery" },

  { label: "Условия и оплата", to: "/wholesale-terms" },

];



/** Square VK glyph — lucide-react doesn't ship a VK icon. */

const VkIcon = ({ className }: { className?: string }) => (

  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>

    <path d="M13.162 16.5c-4.92 0-7.727-3.373-7.844-8.984h2.465c.081 4.116 1.897 5.86 3.334 6.22V7.516h2.322v3.555c1.42-.153 2.911-1.772 3.415-3.555h2.322c-.387 2.2-2.006 3.82-3.158 4.486 1.152.54 2.996 1.951 3.697 4.498h-2.556c-.548-1.71-1.915-3.032-3.72-3.212V16.5h-.277Z" />

  </svg>

);



const SiteFooter = () => {

  const year = new Date().getFullYear();



  return (

    <footer className="mt-16 border-t border-border bg-surface">

      <div className="container grid gap-8 py-10 sm:grid-cols-2 sm:gap-10 md:py-14 lg:grid-cols-[1.6fr_1fr_1fr_1.1fr]">

        {/* Brand + description */}

        <div>

          <Link

            to="/"

            aria-label="На главную"

            className="group inline-flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"

          >

            <img
              src="/brand/candwax-monogram.png"
              alt=""
              aria-hidden="true"
              className="h-11 w-11 shrink-0 object-contain opacity-90 transition-transform duration-300 ease-out group-hover:scale-105 dark:invert"
            />

            <span className="font-brand text-2xl font-medium tracking-[-0.075em] text-foreground transition-colors duration-300 group-hover:text-primary">

              CANDWAX

            </span>

          </Link>

          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">

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

                className="group inline-flex items-center gap-2.5 text-muted-foreground transition-colors hover:text-primary"

              >

                <span className="grid h-8 w-8 place-items-center rounded-md bg-accent/60 text-muted-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary">

                  <Phone className="h-3.5 w-3.5" />

                </span>

                +7 (800) 555-12-34

              </a>

            </li>

            <li>

              <a

                href="mailto:info@candwax.ru"

                className="group inline-flex items-center gap-2.5 text-muted-foreground transition-colors hover:text-primary"

              >

                <span className="grid h-8 w-8 place-items-center rounded-md bg-accent/60 text-muted-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary">

                  <Mail className="h-3.5 w-3.5" />

                </span>

                info@candwax.ru

              </a>

            </li>

            <li className="flex items-start gap-2.5 text-muted-foreground">

              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent/60 text-muted-foreground">

                <MapPin className="h-3.5 w-3.5" />

              </span>

              <span>г. Москва, ул. Свечная, 15</span>

            </li>

          </ul>



          {/* Social */}

          <div className="mt-5 flex items-center gap-2">

            <SocialButton href="https://t.me/" label="Telegram">

              <Send className="h-4 w-4" />

            </SocialButton>

            <SocialButton href="https://vk.com/" label="ВКонтакте">

              <VkIcon className="h-4 w-4" />

            </SocialButton>

            <SocialButton href="https://wa.me/" label="WhatsApp">

              <MessageCircle className="h-4 w-4" />

            </SocialButton>

          </div>

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

    <div className="eyebrow mb-4">{title}</div>

    <ul className="space-y-2.5 text-sm">

      {links.map((l) => (

        <li key={l.to + l.label}>

          <Link

            to={l.to}

            className="group relative inline-flex items-center text-muted-foreground transition-colors duration-200 hover:text-primary"

          >

            <span

              aria-hidden

              className="mr-0 h-px w-0 bg-primary transition-all duration-300 ease-out group-hover:mr-2 group-hover:w-4"

            />

            {l.label}

          </Link>

        </li>

      ))}

    </ul>

  </div>

);



/** Circular social icon button with amber-glow hover. */

const SocialButton = ({

  href,

  label,

  children,

  className,

}: {

  href: string;

  label: string;

  children: React.ReactNode;

  className?: string;

}) => (

  <a

    href={href}

    target="_blank"

    rel="noreferrer noopener"

    aria-label={label}

    title={label}

    className={cn(

      "group grid h-9 w-9 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-all duration-300 ease-out",

      "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary hover:text-primary-foreground hover:shadow-md hover:shadow-primary/30",

      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",

      className,

    )}

  >

    <span className="transition-transform duration-300 group-hover:scale-110">{children}</span>

  </a>

);



export default SiteFooter;

