import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "light" | "dark" | "system";

const MODES: { value: Mode; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Светлая", Icon: Sun },
  { value: "system", label: "Авто", Icon: Monitor },
  { value: "dark", label: "Тёмная", Icon: Moon },
];

/**
 * Segmented 3-button theme switcher — fits inside the profile dropdown and
 * the mobile drawer. Written as a small visual pill so users immediately see
 * all available modes (Светлая / Авто / Тёмная) without an extra click.
 *
 * `next-themes` returns `undefined` on the very first render (SSR safety),
 * so we wait for `mounted` before showing the active pill to avoid a flicker.
 */
const ThemeToggle = ({ className }: { className?: string }) => {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current: Mode = mounted ? ((theme as Mode | undefined) ?? "system") : "system";

  // Used only to show an informational hint under the toggle when the user
  // has picked "Авто" (follows OS).
  const resolvedHint =
    mounted && current === "system"
      ? systemTheme === "dark"
        ? " · сейчас тёмная"
        : " · сейчас светлая"
      : "";

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Тема оформления
        </span>
        {mounted && current === "system" && (
          <span className="text-[10px] text-muted-foreground/80">{resolvedHint.slice(3)}</span>
        )}
      </div>
      <div
        role="radiogroup"
        aria-label="Тема оформления"
        className="relative grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/50 p-1"
      >
        {MODES.map(({ value, label, Icon }) => {
          const active = current === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(value)}
              className={cn(
                "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium outline-none transition-all duration-200",
                "focus-visible:ring-2 focus-visible:ring-primary/40",
                active
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-3.5 w-3.5 transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ThemeToggle;
