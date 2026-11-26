import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { de, en, fr, it as italian } from "../../i18n/locales";
import {
  dashboardTour,
  incidentListTour,
  journalEditorTour,
  journalMessagesTour,
  mapTour,
  triageTour,
} from "./tours";

const tours = {
  incidentListTour,
  dashboardTour,
  journalMessagesTour,
  journalEditorTour,
  triageTour,
  mapTour,
};

// Returns the key itself, so a step's title and description are the keys it looks up.
const keyOnly = ((key: string) => key) as unknown as TFunction;

const lookup = (locale: unknown, key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node !== null && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      locale,
    );

// A missing key renders as the raw key at runtime and fails no build: check them here.
describe("tour texts", () => {
  const keys = [
    ...["start", "next", "previous", "done", "close", "progress"].map((key) => `tour.${key}`),
    ...Object.values(tours).flatMap((tour) =>
      tour(keyOnly).flatMap((step) => [step.title, step.description]),
    ),
  ];

  it.each([
    ["de", de],
    ["en", en],
    ["fr", fr],
    ["it", italian],
  ])("are all translated in %s", (_, locale) => {
    const missing = keys.filter((key) => typeof lookup(locale, key) !== "string");
    expect(missing).toEqual([]);
  });
});
