import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeatureMessagesList } from "./FeatureMessagesList";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { number?: number }) =>
      options?.number === undefined ? key : `${key}:${options.number}`,
  }),
}));

describe("FeatureMessagesList", () => {
  it("lists every connected message with its number, route and content", () => {
    render(
      <FeatureMessagesList
        messages={[
          {
            id: "m1",
            number: 12,
            sender: "Alice",
            receiver: "Bob",
            content: "Brücke gesperrt",
            time: new Date("2026-01-15T14:05:00"),
          },
          {
            id: "m2",
            number: 14,
            sender: "Carol",
            receiver: "",
            content: "Brücke wieder offen",
            time: new Date("2026-01-15T15:10:00"),
          },
        ]}
      />,
    );

    expect(screen.getByText(/featureMessages.message:12/)).toBeTruthy();
    expect(screen.getByText(/featureMessages.message:14/)).toBeTruthy();
    expect(screen.getByText("Alice → Bob")).toBeTruthy();
    expect(screen.getByText("Carol")).toBeTruthy();
    expect(screen.getByText("Brücke gesperrt")).toBeTruthy();
    expect(screen.getByText(/15\.01\.26 14:05/)).toBeTruthy();
  });
});
