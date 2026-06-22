import type { Dispatch, SetStateAction } from "react";
import { ChevronLeft, ChevronRight, Download, MoreVertical, Search } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { BubbleChatIcon, Package01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ORDER_STATUSES, STATUS_LABEL, StatusPill } from "@/components/admin/AdminPrimitives";
import type { Currency, OrderListOut } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type OrdersFilter = "all" | "new" | "processing" | "ready" | "completed" | "cancelled";

interface OrdersTabProps {
  ordersFilter: OrdersFilter;
  ordersCountByFilter: Record<OrdersFilter, number>;
  ordersSearch: string;
  selectedOrderIds: Set<string>;
  filteredOrders: OrderListOut[];
  pagedOrders: OrderListOut[];
  allOnPageSelected: boolean;
  someOnPageSelected: boolean;
  pageOrderIds: string[];
  safeOrderPage: number;
  totalOrderPages: number;
  ordersPerPage: number;
  onFilterChange: (filter: OrdersFilter) => void;
  onSearchChange: (search: string) => void;
  onPageChange: Dispatch<SetStateAction<number>>;
  onToggleAllOnPage: () => void;
  onToggleSelected: (id: string) => void;
  onClearSelection: () => void;
  onBulkConfirm: (ids: string[]) => void;
  onBulkReject: (ids: string[]) => void;
  onExport: (orders: OrderListOut[]) => void;
  onApprove: (order: OrderListOut) => void;
  onReject: (order: OrderListOut) => void;
  onConfirmPayment: (order: OrderListOut) => void;
  onMarkReady: (order: OrderListOut) => void;
  onMarkCompleted: (order: OrderListOut) => void;
  onOpen: (id: string) => void;
  onContactOrderChange: (order: OrderListOut) => void;
  onContactSubjectChange: (subject: string) => void;
  onContactBodyChange: (body: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
}

export function OrdersTab({
  ordersFilter,
  ordersCountByFilter,
  ordersSearch,
  selectedOrderIds,
  filteredOrders,
  pagedOrders,
  allOnPageSelected,
  someOnPageSelected,
  pageOrderIds,
  safeOrderPage,
  totalOrderPages,
  ordersPerPage: ORDERS_PER_PAGE,
  onFilterChange: setOrdersFilter,
  onSearchChange: setOrdersSearch,
  onPageChange: setOrdersPage,
  onToggleAllOnPage: toggleAllOnPage,
  onToggleSelected: toggleOrderSelected,
  onClearSelection: clearOrderSelection,
  onBulkConfirm: bulkConfirmOrders,
  onBulkReject: bulkRejectOrders,
  onExport: exportOrdersCsv,
  onApprove: approveOrder,
  onReject: rejectOrder,
  onConfirmPayment: confirmPayment,
  onMarkReady: markReady,
  onMarkCompleted: markCompleted,
  onOpen: setOpenOrderId,
  onContactOrderChange: setContactOrder,
  onContactSubjectChange: setContactSubject,
  onContactBodyChange: setContactBody,
  onUpdateStatus: updateStatus,
}: OrdersTabProps) {
  const STATUSES = ORDER_STATUSES;
  return (
        <div className="space-y-5">
          {/* Filter tabs — mirrors the counts shown in the sidebar badge,
              with the active tab highlighted by an underline bar. */}
          <div className="flex items-center gap-6 border-b border-border">
            {([
              { key: "all", label: "Все" },
              { key: "new", label: "Новые" },
              { key: "processing", label: "В работе" },
              { key: "ready", label: "Готовы" },
              { key: "completed", label: "Завершенные" },
              { key: "cancelled", label: "Отменённые" },
            ] as { key: OrdersFilter; label: string }[]).map((t) => {
              const active = ordersFilter === t.key;
              const count = ordersCountByFilter[t.key];
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setOrdersFilter(t.key)}
                  className={cn(
                    "relative flex items-center gap-2 pb-3 pt-1 text-sm transition-colors",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{t.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 text-xs font-medium",
                      active
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                  {active && (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Поиск по номеру, клиенту..."
              value={ordersSearch}
              onChange={(e) => setOrdersSearch(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/*
            Bulk-actions bar — появляется, когда выбрана хотя бы одна заявка.
            Кнопки применяют одно действие сразу ко всем выделенным: статус
            меняется batch-запросом, «Экспорт» выгружает только выбранные,
            «Снять выделение» очищает Set. Нерелевантные заявки (например,
            уже cancelled) автоматически пропускаются в bulkUpdateOrderStatus.
          */}
          {selectedOrderIds.size > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-5xl flex-wrap items-center gap-3 rounded-t-lg border border-primary/30 bg-background/95 px-4 py-3 text-sm shadow-lg backdrop-blur-sm">
              <span className="font-medium text-foreground">
                Выбрано: <span className="num text-primary">{selectedOrderIds.size}</span>
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-success/30 bg-success/10 text-success hover:border-success/60 hover:bg-success/15 hover:text-success"
                  onClick={() => bulkConfirmOrders(Array.from(selectedOrderIds))}
                >
                  Подтвердить
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-destructive/30 bg-destructive/10 text-destructive hover:border-destructive/60 hover:bg-destructive/15 hover:text-destructive"
                  onClick={() => bulkRejectOrders(Array.from(selectedOrderIds))}
                >
                  Отклонить
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() =>
                    exportOrdersCsv(
                      filteredOrders.filter((o) => selectedOrderIds.has(o.id)),
                    )
                  }
                >
                  <Download className="h-4 w-4" /> Экспорт выбранных
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-muted-foreground hover:text-foreground"
                  onClick={clearOrderSelection}
                >
                  Снять выделение
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-3">
                    {/* Checkbox «выбрать всё на странице».
                        `indeterminate` устанавливается через ref—
                        этого свойства нет у React-пропсов. */}
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someOnPageSelected;
                      }}
                      onChange={toggleAllOnPage}
                      disabled={pageOrderIds.length === 0}
                      aria-label="Выбрать все заявки на странице"
                      className="h-4 w-4 cursor-pointer rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </th>
                  <th className="px-4 py-3">№</th>
                  <th className="px-4 py-3">Клиент</th>
                  <th className="px-4 py-3">Дата</th>
                  <th className="px-4 py-3 text-right">Сумма</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Действия</th>
                </tr>
              </thead>
              <tbody>
                {pagedOrders.map((o) => {
                  const isNew = o.status === "new";
                  return (
                    <tr key={o.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.has(o.id)}
                          onChange={() => toggleOrderSelected(o.id)}
                          aria-label={`Выбрать заявку ${o.order_number}`}
                          className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                        />
                      </td>
                      <td className="num px-4 py-3 font-semibold">#{o.order_number}</td>
                      <td className="px-4 py-3">{o.company_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                        })}
                      </td>
                      <td className="price px-4 py-3 text-right">
                        {formatMoney(Number(o.total), o.currency as Currency)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={o.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isNew && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => approveOrder(o)}
                                className="h-8 border-success/30 bg-success/10 text-success hover:border-success/60 hover:bg-success/15 hover:text-success"
                              >
                                Одобрить
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => rejectOrder(o)}
                                className="h-8 border-destructive/30 bg-destructive/10 text-destructive hover:border-destructive/60 hover:bg-destructive/15 hover:text-destructive"
                              >
                                Отклонить
                              </Button>
                            </>
                          )}
                          {o.status === "processing" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approveOrder(o)}
                              className="h-8 border-success/30 bg-success/10 text-success hover:border-success/60 hover:bg-success/15 hover:text-success"
                            >
                              Одобрить
                            </Button>
                          )}
                          {o.status === "payment_review" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => confirmPayment(o)}
                              className="h-8 border-success/30 bg-success/10 text-success hover:border-success/60 hover:bg-success/15 hover:text-success"
                            >
                              Оплата ✓
                            </Button>
                          )}
                          {o.status === "paid" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markReady(o)}
                              className="h-8 border-success/30 bg-success/10 text-success hover:border-success/60 hover:bg-success/15 hover:text-success"
                            >
                              Готово
                            </Button>
                          )}
                          {o.status === "shipped" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markCompleted(o)}
                              className="h-8 border-muted-foreground/30 bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              Выдан
                            </Button>
                          )}
                          {/* ⋮-кнопка — outline-вариант с рамкой (как на скрине). Кнопка
                              счёта-договора перенесена в диалог заявки чтобы меню стало лаконичным. */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 p-0"
                                aria-label="Действия"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {/* Иконки из hugeicons (free сет), по просьбе пользователя.
                                  `gap-3` — ~12px между иконкой и текстом,
                                  `strokeWidth={2}` делает контур потолще — ближе
                                  к solid-стилю из макета. */}
                              <DropdownMenuItem className="gap-3" onClick={() => setOpenOrderId(o.id)}>
                                <HugeiconsIcon icon={Package01Icon} size={16} strokeWidth={2} />
                                Открыть
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-3"
                                onClick={() => {
                                  setContactOrder(o);
                                  setContactSubject(`По заявке #${o.order_number}`);
                                  setContactBody("");
                                }}
                              >
                                <HugeiconsIcon icon={BubbleChatIcon} size={16} strokeWidth={2} />
                                Связаться
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="gap-3 text-xs">
                                  Изменить статус
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="w-40">
                                  {STATUSES.filter((s) => s !== o.status).map((s) => (
                                    <DropdownMenuItem
                                      key={s}
                                      onClick={() => updateStatus(o.id, s)}
                                      className="text-xs"
                                    >
                                      {STATUS_LABEL[s]?.label ?? s}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pagedOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-muted-foreground">
                      Заявок не найдено
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer — rendered only when there's something to page */}
          {filteredOrders.length > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Показано {(safeOrderPage - 1) * ORDERS_PER_PAGE + 1}–
                {Math.min(safeOrderPage * ORDERS_PER_PAGE, filteredOrders.length)} из{" "}
                {filteredOrders.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                  disabled={safeOrderPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalOrderPages }, (_, i) => i + 1).map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={n === safeOrderPage ? "default" : "outline"}
                    className="h-8 w-8 p-0"
                    onClick={() => setOrdersPage(n)}
                  >
                    {n}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setOrdersPage((p) => Math.min(totalOrderPages, p + 1))}
                  disabled={safeOrderPage === totalOrderPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
  );
}
