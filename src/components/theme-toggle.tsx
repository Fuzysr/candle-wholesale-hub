import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Simple icon button that toggles between light and dark themes.
 * Renders a Sun (in dark mode) or Moon (in light mode) with a smooth
 * rotate+scale micro-animation on switch.
 *
 * `next-themes` returns `undefined` on the very first render (SSR safety),
 * so we wait for `mounted` before rendering to avoid a flicker.
 */
const ThemeToggle = ({ className }: { className?: string }) => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Render an invisible placeholder so layout doesn't shift.
    return <span className={cn("inline-block h-10 w-10", className)} />;
  }

  const isDark = resolvedTheme === "dark";

  const toggle = () => {
    const next = isDark ? "light" : "dark";
    // Use the View Transitions API for a smooth 60 fps cross-fade.
    // Falls back to an instant switch on unsupported browsers.
    if ("startViewTransition" in document) {
      (document as any).startViewTransition(() => setTheme(next));
    } else {
      setTheme(next);
    }
  };

  return (
    <button
      type="button"
      aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
      onClick={toggle}
      className={cn(
        "group relative grid h-10 w-10 shrink-0 place-items-center rounded-md",
        "text-foreground/70 transition-all duration-200 ease-out",
        "hover:bg-accent/70 hover:text-foreground hover:shadow-sm",
        "focus-visible:outline-none focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0",
        "active:scale-90",
        className,
      )}
    >
      {/* Sun — visible in dark mode */}
      <Sun
        className={cn(
          "absolute h-5 w-5 transition-all duration-500 ease-out",
          isDark
            ? "rotate-0 scale-100 opacity-100"
            : "rotate-90 scale-0 opacity-0",
        )}
      />
      {/* Moon — visible in light mode */}
      <Moon
        className={cn(
          "absolute h-5 w-5 transition-all duration-500 ease-out",
          isDark
            ? "-rotate-90 scale-0 opacity-0"
            : "rotate-0 scale-100 opacity-100",
        )}
      />
    </button>
  );
};

export default ThemeToggle;
