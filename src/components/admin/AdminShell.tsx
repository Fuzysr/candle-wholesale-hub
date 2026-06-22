import { useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Percent,
  Settings,
  Tag,
  Users,
  Warehouse,
} from "lucide-react";

import UserMenu from "@/components/layout/UserMenu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type AdminTab =
  | "dashboard"
  | "orders"
  | "products"
  | "categories"
  | "clients"
  | "messages"
  | "stock"
  | "discounts"
  | "settings";

type BadgeKey = "newOrders" | "newMessages";

type NavItem = {
  key: AdminTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badgeKey?: BadgeKey;
};

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Дашборд", icon: LayoutDashboard },
  { key: "orders", label: "Заявки", icon: ClipboardList, badgeKey: "newOrders" },
  { key: "products", label: "Товары", icon: Package },
  { key: "categories", label: "Категории", icon: Tag },
  { key: "clients", label: "Клиенты", icon: Users },
  { key: "messages", label: "Обращения", icon: MessageSquare, badgeKey: "newMessages" },
  { key: "stock", label: "Склад", icon: Warehouse },
  { key: "discounts", label: "Скидки", icon: Percent },
  { key: "settings", label: "Настройки", icon: Settings },
];

const TAB_TITLES: Record<AdminTab, string> = Object.fromEntries(
  NAV_ITEMS.map(({ key, label }) => [key, label]),
) as Record<AdminTab, string>;

type AdminNavigationProps = {
  tab: AdminTab;
  setTab: (tab: AdminTab) => void;
  newOrdersBadge: number;
  newMessagesBadge: number;
  onNavigate?: () => void;
  itemClassName?: string;
};

const AdminNavigation = ({
  tab,
  setTab,
  newOrdersBadge,
  newMessagesBadge,
  onNavigate,
  itemClassName,
}: AdminNavigationProps) => {
  const badges: Record<BadgeKey, number> = {
    newOrders: newOrdersBadge,
    newMessages: newMessagesBadge,
  };

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = tab === item.key;
        const badge = item.badgeKey ? badges[item.badgeKey] : 0;

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setTab(item.key);
              onNavigate?.();
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 text-sm transition-colors",
              itemClassName ?? "py-2",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            {badge > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-primary-foreground">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

type SignOutButtonProps = {
  onSignOut: () => void;
  onDone?: () => void;
  className?: string;
};

const SignOutButton = ({ onSignOut, onDone, className }: SignOutButtonProps) => (
  <div className="border-t border-sidebar-border p-3">
    <button
      type="button"
      onClick={() => {
        onSignOut();
        onDone?.();
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive",
        className ?? "py-2",
      )}
    >
      <LogOut className="h-4 w-4" />
      Выйти
    </button>
  </div>
);

export type AdminSidebarProps = Omit<AdminNavigationProps, "onNavigate" | "itemClassName"> & {
  onSignOut: () => void;
};

export const AdminSidebar = ({ onSignOut, ...navigationProps }: AdminSidebarProps) => (
  <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar-background lg:flex">
    <Link to="/" className="flex items-center gap-2 border-b border-sidebar-border px-5 py-5">
      <span className="text-lg font-semibold tracking-tight text-foreground">CANDWAX</span>
      <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
        admin
      </span>
    </Link>
    <AdminNavigation {...navigationProps} />
    <SignOutButton onSignOut={onSignOut} />
  </aside>
);

export type AdminTopbarProps = {
  title: string;
  actions?: ReactNode;
  onMenuToggle?: () => void;
};

export const AdminTopbar = ({ title, actions, onMenuToggle }: AdminTopbarProps) => {
  const dateStr = new Date().toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
      <div className="flex items-center gap-3">
        {onMenuToggle && (
          <button
            type="button"
            onClick={onMenuToggle}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="Меню"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-lg font-semibold tracking-tight sm:text-2xl">{title}</h1>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        {actions}
        <span className="hidden text-sm text-muted-foreground sm:inline">{dateStr}</span>
        <UserMenu alwaysVisible />
      </div>
    </header>
  );
};

export type AdminShellProps = {
  tab: AdminTab;
  setTab: (tab: AdminTab) => void;
  newOrdersBadge: number;
  newMessagesBadge: number;
  onSignOut: () => void;
  actions?: ReactNode;
  children: ReactNode;
};

export const AdminShell = ({
  tab,
  setTab,
  newOrdersBadge,
  newMessagesBadge,
  onSignOut,
  actions,
  children,
}: AdminShellProps) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigationProps = { tab, setTab, newOrdersBadge, newMessagesBadge };

  return (
    <div className="flex min-h-screen bg-muted/30">
      <AdminSidebar {...navigationProps} onSignOut={onSignOut} />

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[260px] p-0 lg:hidden">
          <div className="flex h-full flex-col bg-sidebar-background">
            <SheetHeader className="border-b border-sidebar-border px-5 py-4">
              <SheetTitle className="flex items-center gap-2 text-left">
                <span className="text-lg font-semibold tracking-tight">CANDWAX</span>
                <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  admin
                </span>
              </SheetTitle>
            </SheetHeader>
            <AdminNavigation
              {...navigationProps}
              onNavigate={() => setMobileNavOpen(false)}
              itemClassName="py-2.5"
            />
            <SignOutButton
              onSignOut={onSignOut}
              onDone={() => setMobileNavOpen(false)}
              className="py-2.5"
            />
          </div>
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar
          title={TAB_TITLES[tab]}
          actions={actions}
          onMenuToggle={() => setMobileNavOpen(true)}
        />
        <div className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
};
