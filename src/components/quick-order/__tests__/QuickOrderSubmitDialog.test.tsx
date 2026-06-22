import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  QuickOrderSubmitDialog,
  type QuickOrderForm,
} from "@/components/quick-order/QuickOrderSubmitDialog";

const form: QuickOrderForm = {
  company_name: "CANDWAX Client",
  contact_name: "Анна",
  phone: "+375291234567",
  inn: "123456789",
  email: "client@example.com",
  delivery_date: "",
  customer_comment: "",
};

describe("QuickOrderSubmitDialog", () => {
  it("shows the order summary and submits a valid order", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <QuickOrderSubmitDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        form={form}
        setForm={vi.fn()}
        positions={2}
        totalBoxes={7}
        discount={5}
        total={12_500}
        currency="RUB"
        submitting={false}
      />,
    );

    expect(screen.getByText("Скидка 5%")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Отправить заявку/ }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("does not submit an empty order and closes through cancel", () => {
    const onOpenChange = vi.fn();
    render(
      <QuickOrderSubmitDialog
        open
        onOpenChange={onOpenChange}
        onSubmit={vi.fn()}
        form={form}
        setForm={vi.fn()}
        positions={0}
        totalBoxes={0}
        discount={0}
        total={0}
        currency="RUB"
        submitting={false}
      />,
    );

    expect(screen.getByRole("button", { name: /Отправить заявку/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
