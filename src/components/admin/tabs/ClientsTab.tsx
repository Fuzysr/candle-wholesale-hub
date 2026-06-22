import type { UserOut } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ClientOrderStats = {
  orders: number;
  total: number;
  lastAt: string;
};

export type ClientsTabProps = {
  users: UserOut[];
  orderStats: ReadonlyMap<string, ClientOrderStats>;
};

export const ClientsTab = ({ users, orderStats }: ClientsTabProps) => (
  <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
    <table className="w-full text-sm">
      <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="px-4 py-3">Компания</th>
          <th className="px-4 py-3">Контакт</th>
          <th className="px-4 py-3">Email / телефон</th>
          <th className="px-4 py-3">Роль</th>
          <th className="px-4 py-3 text-right">Заявок</th>
          <th className="px-4 py-3 text-right">Оборот</th>
          <th className="px-4 py-3">Регистрация</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => {
          const stats = orderStats.get(user.id);
          return (
            <tr key={user.id} className="border-t border-border align-top">
              <td className="px-4 py-3 font-medium">{user.company_name || "—"}</td>
              <td className="px-4 py-3">{user.contact_name || "—"}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground"><div>{user.email}</div><div>{user.phone || ""}</div></td>
              <td className="px-4 py-3">
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", user.role === "admin" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                  {user.role === "admin" ? "Админ" : "Клиент"}
                </span>
              </td>
              <td className="num px-4 py-3 text-right">{stats?.orders ?? 0}</td>
              <td className="price px-4 py-3 text-right">{formatMoney(stats?.total ?? 0, "RUB")}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(user.created_at).toLocaleDateString("ru-RU")}</td>
            </tr>
          );
        })}
        {users.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Пользователей пока нет</td></tr>}
      </tbody>
    </table>
  </div>
);

