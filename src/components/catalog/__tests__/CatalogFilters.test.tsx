import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  FilterCheckList,
  RangeFilter,
} from "@/components/catalog/CatalogComponents";

describe("catalog filters", () => {
  it("forwards checklist toggles", () => {
    const onToggle = vi.fn();
    render(
      <FilterCheckList
        items={[{ id: "soy", label: "Соевый воск" }]}
        selected={new Set(["soy"])}
        onToggle={onToggle}
      />,
    );

    expect(screen.getByRole("checkbox")).toBeChecked();
    fireEvent.click(screen.getByText("Соевый воск"));
    expect(onToggle).toHaveBeenCalledWith("soy");
  });

  it("updates both range boundaries", () => {
    const onMin = vi.fn();
    const onMax = vi.fn();
    render(<RangeFilter min="10" max="20" onMin={onMin} onMax={onMax} unit="мм" />);

    fireEvent.change(screen.getByPlaceholderText("от, мм"), { target: { value: "12" } });
    fireEvent.change(screen.getByPlaceholderText("до, мм"), { target: { value: "18" } });
    expect(onMin).toHaveBeenCalledWith("12");
    expect(onMax).toHaveBeenCalledWith("18");
  });
});
