import { useState, type FormEvent } from "react";
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import PublicLayout from "@/components/layout/PublicLayout";
import Reveal from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
  Mock contact data — a single source of truth so changing the phone / address
  in the future only needs one edit. These are intentionally plausible but
  fictitious values; swap them for real data when the business confirms.
*/
const CONTACT = {
  phone: "+7 (800) 555-12-34",
  email: "info@mirsvechi.ru",
  address: "г. Москва, ул. Свечная, 15",
  hours: "Пн–Пт: 9:00–18:00",
  // Approx. Red-Square area — used for the OpenStreetMap iframe below. Update
  // once the actual warehouse coordinates are known.
  mapLat: 55.7558,
  mapLon: 37.6173,
  mapBbox: "37.58,55.745,37.66,55.77",
};

/**
 * Copy text to the clipboard using the modern Clipboard API with a
 * `document.execCommand("copy")` fallback for browsers that block the async
 * API on insecure origins. Returns `true` on success.
 */
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Legacy fallback — build an off-screen textarea, select, execCommand.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};

/**
 * Format a free-form phone input as `+7 (XXX) XXX-XX-XX` on every keystroke.
 * Accepts pastes of raw digits or numbers starting with 7 / 8 and ignores
 * anything non-numeric, so the field is pleasant to type in without a heavy
 * masking library.
 */
const formatPhoneRu = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").replace(/^8/, "7");
  const rest = (digits.startsWith("7") ? digits.slice(1) : digits).slice(0, 10);
  if (rest.length === 0) return "";
  let out = "+7 (" + rest.slice(0, 3);
  if (rest.length >= 3) out += ")";
  if (rest.length > 3) out += " " + rest.slice(3, 6);
  if (rest.length > 6) out += "-" + rest.slice(6, 8);
  if (rest.length > 8) out += "-" + rest.slice(8, 10);
  return out;
};

type InfoRowProps = {
  icon: typeof Phone;
  label: string;
  value: string;
  /**
   * When provided, the row becomes a button: clicking copies this string to
   * the clipboard and shows a toast. When omitted, the row is purely
   * informational (used for "Режим работы").
   */
  copy?: string;
  /** Human-readable thing we just copied — used in the toast description. */
  copyLabel?: string;
};

/** Single contact row — icon badge + small uppercase label + primary value. */
const InfoRow = ({ icon: Icon, label, value, copy, copyLabel }: InfoRowProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!copy) return;
    const ok = await copyToClipboard(copy);
    if (ok) {
      setCopied(true);
      toast.success(`${copyLabel ?? label} скопирован`, {
        description: copy,
        duration: 1800,
      });
      window.setTimeout(() => setCopied(false), 1600);
    } else {
      toast.error("Не удалось скопировать", {
        description: "Скопируйте вручную: " + copy,
      });
    }
  };

  const body = (
    <>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className="truncate text-base font-semibold text-foreground">
          {value}
        </span>
      </span>
    </>
  );

  // Non-copyable rows (e.g. hours) render as plain divs without hover styling.
  if (!copy) {
    return (
      <div className="group flex items-center gap-3 rounded-lg py-1.5">
        {body}
      </div>
    );
  }

  // Copyable rows are full-width buttons. We show a small copy/check icon on
  // the right that fades in on hover so users know the row is interactive,
  // and flips to a green check for ~1.6 s after a successful copy.
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Скопировать: ${value}`}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg py-1.5 text-left",
        "transition-colors",
        copied ? "text-primary" : "hover:text-primary",
      )}
    >
      {body}
      <span
        aria-hidden
        className={cn(
          "ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-all",
          copied
            ? "bg-success/10 text-success opacity-100"
            : "opacity-0 group-hover:bg-accent group-hover:text-foreground group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
};

type FormState = { name: string; phone: string; message: string };
const EMPTY_FORM: FormState = { name: "", phone: "", message: "" };

const Contacts = () => {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [sending, setSending] = useState(false);

  const onChange =
    <K extends keyof FormState>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const raw = e.target.value;
      setForm((prev) => ({
        ...prev,
        [key]: key === "phone" ? formatPhoneRu(raw) : raw,
      }));
    };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Stub submission — no backend yet. Simulate a tiny delay so the button's
    // loading state is visible, then celebrate with a toast.
    setSending(true);
    await new Promise((r) => setTimeout(r, 500));
    setSending(false);
    toast.success("Заявка отправлена", {
      description: "Мы свяжемся с вами в ближайшее время.",
    });
    setForm(EMPTY_FORM);
  };

  return (
    <PublicLayout>
      <div className="container max-w-6xl py-10 md:py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* ───────── Left column — intro, contact rows, map ───────── */}
          <div className="flex flex-col gap-8">
            <Reveal delay={0} y={20}>
              <div>
                <h1 className="font-semibold tracking-tight text-[clamp(1.5rem,4vw,2.25rem)]">
                  Контакты
                </h1>
                <p className="mt-3 text-sm text-muted-foreground md:text-base">
                  Свяжитесь с нами любым удобным способом — ответим быстро.
                </p>
              </div>
            </Reveal>

            <Reveal delay={120} y={18}>
              <div className="flex flex-col gap-3">
                <InfoRow
                  icon={Phone}
                  label="Телефон"
                  value={CONTACT.phone}
                  copy={CONTACT.phone}
                  copyLabel="Телефон"
                />
                <InfoRow
                  icon={Mail}
                  label="Email"
                  value={CONTACT.email}
                  copy={CONTACT.email}
                  copyLabel="Email"
                />
                <InfoRow
                  icon={MapPin}
                  label="Адрес"
                  value={CONTACT.address}
                  copy={CONTACT.address}
                  copyLabel="Адрес"
                />
                {/* Work hours are informational only — no copy action. */}
                <InfoRow icon={Clock} label="Режим работы" value={CONTACT.hours} />
              </div>
            </Reveal>

            <Reveal delay={260} y={24}>
              {/* Map embed — OpenStreetMap requires no API key. The outer
                  wrapper handles rounded corners + aspect ratio; the iframe
                  itself is themed-neutral (OSM tiles are light) and will look
                  the same in both light and dark site themes. */}
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                <div className="relative aspect-[16/9] w-full">
                  <iframe
                    title="Карта офиса"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
                      CONTACT.mapBbox,
                    )}&layer=mapnik&marker=${CONTACT.mapLat},${CONTACT.mapLon}`}
                    className="absolute inset-0 h-full w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {CONTACT.address}
                  </span>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${CONTACT.mapLat}&mlon=${CONTACT.mapLon}#map=16/${CONTACT.mapLat}/${CONTACT.mapLon}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary transition-colors hover:text-primary-hover"
                  >
                    Открыть в карте →
                  </a>
                </div>
              </div>
            </Reveal>
          </div>

          {/* ───────── Right column — contact form ───────── */}
          <Reveal delay={180} y={24}>
            <form
              onSubmit={onSubmit}
              autoComplete="off"
              className="rounded-xl border border-border bg-surface p-6 shadow-sm md:p-7"
            >
              <h2 className="text-xl font-semibold tracking-tight">Напишите нам</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Заполните форму — менеджер перезвонит.
              </p>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-foreground">
                    Имя <span className="text-primary">*</span>
                  </span>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={onChange("name")}
                    placeholder="Ваше имя"
                    autoComplete="off"
                    className={cn(
                      "h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground/60",
                      "transition-all duration-200 ease-out",
                      "hover:border-primary/30",
                      "focus:border-primary/60 focus:bg-background focus:ring-4 focus:ring-primary/15",
                    )}
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-foreground">
                    Телефон <span className="text-primary">*</span>
                  </span>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={onChange("phone")}
                    placeholder="+7 (___) ___-__-__"
                    inputMode="tel"
                    autoComplete="off"
                    className={cn(
                      "h-11 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums outline-none placeholder:text-muted-foreground/60",
                      "transition-all duration-200 ease-out",
                      "hover:border-primary/30",
                      "focus:border-primary/60 focus:bg-background focus:ring-4 focus:ring-primary/15",
                    )}
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-foreground">
                    Сообщение
                  </span>
                  <textarea
                    value={form.message}
                    onChange={onChange("message")}
                    placeholder="Ваш вопрос или запрос..."
                    rows={5}
                    className={cn(
                      "w-full resize-y rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60",
                      "transition-all duration-200 ease-out",
                      "hover:border-primary/30",
                      "focus:border-primary/60 focus:bg-background focus:ring-4 focus:ring-primary/15",
                    )}
                  />
                </label>
              </div>

              <Button
                type="submit"
                disabled={sending}
                className="mt-6 h-11 w-full gap-2 text-sm font-semibold shadow-sm shadow-primary/25 hover:shadow-md hover:shadow-primary/40"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Отправляем...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Отправить
                  </>
                )}
              </Button>

              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Нажимая «Отправить», вы соглашаетесь на обработку персональных данных.
              </p>
            </form>
          </Reveal>
        </div>
      </div>
    </PublicLayout>
  );
};

export default Contacts;
