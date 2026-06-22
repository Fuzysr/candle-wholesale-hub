import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Field, KpiCard, StatusPill, TextArea } from "@/components/admin/AdminPrimitives";

describe("admin primitives", () => {
  it("renders known and unknown order statuses", () => {
    const { rerender } = render(<StatusPill status="paid" />);
    expect(screen.getByText("Оплачен")).toBeInTheDocument();

    rerender(<StatusPill status="custom_status" />);
    expect(screen.getByText("custom_status")).toBeInTheDocument();
  });

  it("keeps Field and TextArea accessible through their labels", () => {
    const onChange = vi.fn();
    render(
      <>
        <Field label="Артикул" value="SKU-1" onChange={onChange} />
        <TextArea label="Комментарий" defaultValue="Текст" />
      </>,
    );

    fireEvent.change(screen.getByLabelText("Артикул"), { target: { value: "SKU-2" } });
    expect(onChange).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Комментарий")).toHaveValue("Текст");
  });

  it("renders an optional KPI delta", () => {
    const { rerender } = render(<KpiCard label="Выручка" value="42 ₽" />);
    expect(screen.queryByText("за месяц")).not.toBeInTheDocument();

    rerender(<KpiCard label="Выручка" value="42 ₽" delta="за месяц" deltaTone="ok" />);
    expect(screen.getByText("за месяц")).toHaveClass("text-success");
  });
});
