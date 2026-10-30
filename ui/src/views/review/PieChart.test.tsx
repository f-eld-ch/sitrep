import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PieChart } from "./PieChart";

const slices = (high: number, normal: number) => [
  { label: "Hoch", value: high, fillClass: "fill-primary" },
  { label: "Normal", value: normal, fillClass: "fill-muted" },
];

describe("PieChart", () => {
  it("draws a slice for each part, with its label and count in a tooltip", () => {
    const { container } = render(<PieChart slices={slices(1, 3)} caption="Priorität" />);

    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(container.querySelector("title")?.textContent).toBe("Hoch: 1");
    expect(paths[0]).toHaveClass("fill-primary");
    expect(paths[1]).toHaveClass("fill-muted");
  });

  it("reads the caption out in place of the picture", () => {
    const { container } = render(<PieChart slices={slices(1, 3)} caption="Priorität" />);

    expect(screen.getByText("Priorität")).toHaveClass("sr-only");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("takes the larger of two parts the long way round", () => {
    const { container } = render(<PieChart slices={slices(1, 3)} caption="x" />);

    const [small, large] = Array.from(container.querySelectorAll("path")).map((p) =>
      p.getAttribute("d"),
    );
    // The arc flag after the radii: 0 for the quarter, 1 for the three quarters.
    expect(small).toMatch(/A 48 48 0 0 1/);
    expect(large).toMatch(/A 48 48 0 1 1/);
  });

  it("is a whole circle when one part has everything", () => {
    const { container } = render(<PieChart slices={slices(0, 5)} caption="x" />);

    expect(container.querySelectorAll("path")).toHaveLength(0);
    const circle = container.querySelector("circle");
    expect(circle).toHaveClass("fill-muted");
  });

  it("draws nothing for no data", () => {
    const { container } = render(<PieChart slices={slices(0, 0)} caption="x" />);

    expect(container).toBeEmptyDOMElement();
  });
});
