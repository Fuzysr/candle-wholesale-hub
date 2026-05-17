import { NavLink as RouterNavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/components/theme-toggle";

const links = [
  { label: "Каталог", to: "/catalog" },
  { label: "Условия опта", to: "/wholesale-terms" },
  { label: "Галерея", to: "/gallery" },
  { label: "Контакты", to: "/contacts" },
];

const TopBar = () => {
  return (
    <div className="hidden w-full border-b border-border bg-muted/60 lg:block">
      <div className="container flex h-11 items-center justify-between">
        <nav className="flex items-center gap-1">
          {links.map((item) => (
            <RouterNavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {item.label}
            </RouterNavLink>
          ))}
        </nav>

        <ThemeToggle className="h-8 w-8" />
      </div>
    </div>
  );
};

export default TopBar;
