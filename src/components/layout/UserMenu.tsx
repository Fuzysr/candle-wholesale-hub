import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  User,
  LogOut,
  LogIn,
  LayoutDashboard,
  Receipt,
  ChevronRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { signOut, useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


/** Pick up to two readable initials from the user's company name or email. */
const getInitials = (name?: string | null, email?: string | null) => {
  const source = (name?.trim() || email?.split("@")[0] || "").replace(
    /[^\p{L}\p{N}\s]/gu,
    " ",
  );
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

type UserMenuProps = {
  /**
   * Overrides the default trigger classes. Use when you need to tweak spacing
   * or size for a specific surface (например, внутри админки). Defaults to the
   * 40×40 компактной кнопки из публичного хедера.
   */
  triggerClassName?: string;
  /**
   * When `true`, the trigger is visible on every breakpoint. By default
   * (`md:grid`-поведение как в SiteHeader) ниже md кнопка скрывается,
   * потому что мобильная версия показывает user-ссылки в drawer-меню.
   * В админке drawer нет — поэтому передаём `alwaysVisible={true}`.
   */
  alwaysVisible?: boolean;
};

/**
 * Reusable profile dropdown — единый UX для публичного SiteHeader и админки.
 *
 * Содержит:
 *   • Круглую кнопку с иконкой {@link User} и active-dot;
 *   • Drop-down с аватаром-инициалами, пунктами «Мой кабинет / Мои заявки /
 *     Админка» (последний — только для админов), переключателем темы и кнопкой
 *     «Выйти».
 *
 * Если пользователь не залогинен, рендерится ссылка на `/auth` в том же
 * визуальном стиле.
 */
const UserMenu = ({ triggerClassName, alwaysVisible = false }: UserMenuProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const isProfileActive =
    location.pathname.startsWith("/account") || location.pathname.startsWith("/admin");
  const isAccountActive =
    location.pathname.startsWith("/account") &&
    !location.pathname.startsWith("/account/orders");
  const isOrdersActive = location.pathname.startsWith("/account/orders");
  const isAdminActive = location.pathname.startsWith("/admin");

  const triggerBase = cn(
    "group relative h-10 w-10 shrink-0 place-items-center rounded-md transition-all duration-200 ease-out",
    alwaysVisible ? "grid" : "hidden md:grid",
    "hover:bg-accent/70 hover:text-foreground hover:shadow-sm",
    "data-[state=open]:bg-accent data-[state=open]:text-foreground data-[state=open]:ring-1 data-[state=open]:ring-primary/30",
    // tighter, subtler focus-visible (overrides the global ring-2 + ring-offset-2)
    "focus-visible:outline-none focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0",
  );

  if (!user) {
    return (
      <Link
        to="/auth"
        className={cn(
          "group inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
          alwaysVisible ? "flex" : "hidden md:inline-flex",
          triggerClassName,
        )}
      >
        <LogIn className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
        Войти
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Кабинет"
          className={cn(
            triggerBase,
            isProfileActive ? "text-foreground" : "text-foreground/70",
            triggerClassName,
          )}
        >
          <User className="h-5 w-5 transition-transform duration-300 group-hover:scale-110 group-data-[state=open]:scale-110" />
          {/* Active-page dot (mirrors the nav underline style) */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary transition-all duration-300",
              isProfileActive
                ? "scale-100 opacity-100"
                : "scale-0 opacity-0 group-hover:scale-75 group-hover:opacity-60",
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
              {getInitials(
                user.profile?.company_name || user.profile?.contact_name,
                user.profile?.email || user.user.email,
              )}
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
                {user.profile?.company_name ||
                  user.profile?.contact_name ||
                  user.user.email}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {user.profile?.email || user.user.email}
              </div>
            </div>
          </div>
        </div>

        {/* Menu items */}
        <div className="p-1.5">
          <DropdownMenuItem
            asChild
            className="group/item rounded-lg p-0 focus:bg-transparent"
          >
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

          <DropdownMenuItem
            asChild
            className="group/item rounded-lg p-0 focus:bg-transparent"
          >
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
            <DropdownMenuItem
              asChild
              className="group/item rounded-lg p-0 focus:bg-transparent"
            >
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
  );
};

export default UserMenu;
