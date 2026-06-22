import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardTab } from "@/components/admin/tabs/DashboardTab";
import { DiscountsTab } from "@/components/admin/tabs/DiscountsTab";
import { MessagesTab } from "@/components/admin/tabs/MessagesTab";
import { StockTab, type StockVariant } from "@/components/admin/tabs/StockTab";

afterEach(() => vi.restoreAllMocks());

describe("DashboardTab", () => {
  it("renders empty states and opens the orders tab", () => {
    const onViewOrders = vi.fn();
    render(
      <DashboardTab
        newCount={0}
        newTodayCount={0}
        processingCount={0}
        monthRevenue={0}
        activeClients={0}
        recentOrders={[]}
        popularProducts={[]}
        onViewOrders={onViewOrders}
      />,
    );

    expect(screen.getByText("Заявок пока нет")).toBeInTheDocument();
    expect(screen.getByText("Нет товаров")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Все заявки/ }));
    expect(onViewOrders).toHaveBeenCalledOnce();
  });
});

describe("MessagesTab", () => {
  const message = {
    id: "message-1",
    name: "Анна",
    phone: "+375291234567",
    message: "Нужна консультация",
    is_read: false,
    created_at: "2026-06-21T10:00:00Z",
  };

  it("marks an unread message as read", () => {
    const onMarkRead = vi.fn();
    render(<MessagesTab messages={[message]} onMarkRead={onMarkRead} onDelete={vi.fn()} />);

    fireEvent.click(screen.getByTitle("Отметить прочитанным"));
    expect(onMarkRead).toHaveBeenCalledWith("message-1");
  });

  it("deletes only after confirmation", () => {
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<MessagesTab messages={[message]} onMarkRead={vi.fn()} onDelete={onDelete} />);

    const button = screen.getByTitle("Удалить");
    fireEvent.click(button);
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onDelete).toHaveBeenCalledWith("message-1");
  });
});

describe("DiscountsTab", () => {
  it("forwards create, edit and delete actions", () => {
    const tier = { id: "tier-1", min_boxes: 10, discount_percent: 5 };
    const onCreate = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <DiscountsTab
        tiers={[tier]}
        onCreate={onCreate}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Новая скидка/ }));
    const actionButtons = screen.getAllByRole("button").slice(-2);
    fireEvent.click(actionButtons[0]);
    fireEvent.click(actionButtons[1]);

    expect(onCreate).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledWith(tier);
    expect(onDelete).toHaveBeenCalledWith("tier-1");
  });
});

describe("StockTab", () => {
  it("calculates available stock and opens a stock operation", () => {
    const onStockOperation = vi.fn();
    const variant = {
      id: "variant-1",
      sku: "SKU-001",
      product_name: "Свеча",
      stock_boxes: 8,
      reserved_boxes: 3,
      external_id: null,
    } as StockVariant;
    render(<StockTab variants={[variant]} onStockOperation={onStockOperation} />);

    expect(screen.getByText("5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Движение/ }));
    expect(onStockOperation).toHaveBeenCalledWith({
      id: "variant-1",
      sku: "SKU-001",
      stock_boxes: 8,
      reserved_boxes: 3,
    });
  });
});
