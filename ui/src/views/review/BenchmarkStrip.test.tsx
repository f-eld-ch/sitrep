import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewBenchmark } from "types";
import { BenchmarkLegend, BenchmarkStrip } from "./BenchmarkStrip";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));

const benchmark = (over: Partial<ReviewBenchmark> = {}): ReviewBenchmark => ({
  value: 150,
  peers: 10,
  sufficient: true,
  lowest: 60,
  q1: 120,
  median: 180,
  q3: 240,
  highest: 300,
  betterThan: 0.6,
  ...over,
});

const dot = (container: HTMLElement) => container.querySelector<HTMLElement>(".bg-primary");

describe("BenchmarkStrip", () => {
  it("says what is typical, among how many, and where this incident lies", () => {
    render(<BenchmarkStrip label="Median" benchmark={benchmark()} kind="time" />);

    expect(screen.getByText(/review.typical.*"3 min"/)).toBeInTheDocument();
    expect(screen.getByText(/review.peers.*"count":10/)).toBeInTheDocument();
    expect(screen.getByText(/review.fasterThan.*"percent":60/)).toBeInTheDocument();
    // The ends of the strip.
    expect(screen.getByText("1 min")).toBeInTheDocument();
    expect(screen.getByText("5 min")).toBeInTheDocument();
  });

  it("puts the dot where the value lies between the lowest and the highest", () => {
    const { container } = render(
      <BenchmarkStrip label="Median" benchmark={benchmark()} kind="time" />,
    );

    // (150 − 60) / (300 − 60) = 37.5 %
    expect(dot(container)?.style.left).toBe("37.5%");
  });

  it("keeps the dot on the strip when this incident is outside the others' range", () => {
    const { container } = render(
      <BenchmarkStrip
        label="Median"
        benchmark={benchmark({ value: 600, betterThan: 0 })}
        kind="time"
      />,
    );

    expect(dot(container)?.style.left).toBe("100%");
    // The strip grew to reach it.
    expect(screen.getByText("10 min")).toBeInTheDocument();
  });

  it("words a share of messages differently from a time", () => {
    render(
      <BenchmarkStrip
        label="Anteil"
        kind="share"
        benchmark={benchmark({
          value: 0.87,
          lowest: 0.5,
          q1: 0.7,
          median: 0.8,
          q3: 0.9,
          highest: 1,
          betterThan: 0.8,
        })}
      />,
    );

    expect(screen.getByText(/review.higherThan.*"percent":80/)).toBeInTheDocument();
    expect(screen.queryByText(/review.fasterThan/)).toBeNull();
    expect(screen.getByText(/review.typical.*"80 %"/)).toBeInTheDocument();
    expect(screen.getByText("50 %")).toBeInTheDocument();
  });

  it("has no dot and no ranking when this incident has no value", () => {
    const { container } = render(
      <BenchmarkStrip
        label="Median"
        benchmark={benchmark({ value: null, betterThan: null })}
        kind="time"
      />,
    );

    expect(dot(container)).toBeNull();
    expect(screen.queryByText(/review.fasterThan/)).toBeNull();
    expect(screen.getByText(/review.typical/)).toBeInTheDocument();
  });

  it("shows no strip against too few other incidents, only that there are too few", () => {
    const { container } = render(
      <BenchmarkStrip
        label="Median"
        benchmark={benchmark({ peers: 3, sufficient: false })}
        kind="time"
      />,
    );

    expect(screen.getByText(/review.fewPeers.*"peers":3/)).toBeInTheDocument();
    expect(dot(container)).toBeNull();
  });

  it("says when there is nothing to compare with", () => {
    render(
      <BenchmarkStrip
        label="Median"
        benchmark={benchmark({ peers: 0, sufficient: false })}
        kind="time"
      />,
    );

    expect(screen.getByText("review.noPeers")).toBeInTheDocument();
  });

  it("copes with others that all have the same value", () => {
    const flat = benchmark({
      lowest: 120,
      q1: 120,
      median: 120,
      q3: 120,
      highest: 120,
      value: 120,
      betterThan: 0.5,
    });
    const { container } = render(<BenchmarkStrip label="Median" benchmark={flat} kind="time" />);

    expect(dot(container)?.style.left).toBe("50%");
  });
});

describe("BenchmarkLegend", () => {
  it("names the three marks", () => {
    render(<BenchmarkLegend />);

    for (const key of ["review.legendThis", "review.legendRange", "review.legendMedian"]) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
  });
});
