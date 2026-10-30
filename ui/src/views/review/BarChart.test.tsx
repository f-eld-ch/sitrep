import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarChart, niceTicks } from "./BarChart";

describe("niceTicks", () => {
  it.each([
    [0, [0, 1]],
    [1, [0, 1]],
    [3, [0, 1, 2, 3]],
    [6, [0, 2, 4, 6]],
    [14, [0, 5, 10, 15]],
    [37, [0, 10, 20, 30, 40]],
    [100, [0, 50, 100]],
    [230, [0, 100, 200, 300]],
  ])("for a highest bar of %d the axis is %j", (max, expected) => {
    expect(niceTicks(max)).toEqual(expected);
  });

  it("always reaches the highest bar, in whole steps", () => {
    for (let max = 0; max <= 500; max++) {
      const ticks = niceTicks(max);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
      expect(ticks.every(Number.isInteger)).toBe(true);
    }
  });
});

describe("BarChart", () => {
  const bars = Array.from({ length: 9 }, (_, i) => ({
    label: `1${i}:00`,
    value: i === 3 ? 14 : i,
  }));

  it("labels the y axis and the time axis", () => {
    const { container } = render(<BarChart bars={bars} caption="Meldungen" />);

    // The scale: 0 up to a round number above the highest bar (14 → 15).
    for (const tick of ["0", "5", "10", "15"]) {
      expect(container.textContent).toContain(tick);
    }
    // The ends and the quarters of the time axis.
    for (const label of ["10:00", "12:00", "14:00", "16:00", "18:00"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("reads the caption out in place of the picture, and shows each value in a tooltip", () => {
    const { container } = render(<BarChart bars={bars} caption="Meldungen pro Stunde" />);

    // Screen readers get the caption; the bars themselves are hidden from them.
    expect(screen.getByText("Meldungen pro Stunde")).toHaveClass("sr-only");
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('[title="13:00: 14"]')).not.toBeNull();
  });

  it("scales the bars to the top of the axis", () => {
    const { container } = render(<BarChart bars={bars} caption="x" />);

    const tallest = container.querySelector<HTMLElement>('[title="13:00: 14"]');
    expect(tallest?.style.height).toBe(`${(14 / 15) * 100}%`);
  });

  it("can label every other bar, for categories whose labels are wide", () => {
    const categories = [
      { label: "< 1 min", value: 4 },
      { label: "1–2 min", value: 9 },
      { label: "> 2 min", value: 1 },
    ];

    const { container } = render(
      <BarChart bars={categories} caption="Zeiten" labels="alternate" />,
    );

    expect(screen.getByText("< 1 min")).toBeInTheDocument();
    expect(screen.getByText("> 2 min")).toBeInTheDocument();
    expect(screen.queryByText("1–2 min")).toBeNull();
    // The label of a bar that has none is still in its tooltip.
    expect(container.querySelector('[title="1–2 min: 9"]')).not.toBeNull();
  });

  it("copes with no bars at all", () => {
    expect(() => render(<BarChart bars={[]} caption="x" />)).not.toThrow();
  });
});
