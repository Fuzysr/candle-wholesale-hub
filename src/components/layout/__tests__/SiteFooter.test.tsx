import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import SiteFooter from "../SiteFooter";

describe("SiteFooter", () => {
  it("links to category slugs exposed by the catalog API", () => {
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <SiteFooter />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Ароматические свечи" })).toHaveAttribute(
      "href",
      "/catalog/aromatic",
    );
    expect(screen.getByRole("link", { name: "Декоративные свечи" })).toHaveAttribute(
      "href",
      "/catalog/decorative",
    );
    expect(screen.getByRole("link", { name: "Столовые свечи" })).toHaveAttribute(
      "href",
      "/catalog/taper",
    );
    expect(screen.getByRole("link", { name: "Чайные свечи" })).toHaveAttribute(
      "href",
      "/catalog/tealights",
    );
  });
});
