import { render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Resource, ResourceDeploymentPeriod } from "api";
import de from "../../i18n/locales/de/translations.json";
import ResourceTable from "./ResourceTable";

// The real locale file, so a missing translation fails the test.
function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
  return typeof value === "string" ? value : key;
}

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: lookup }) }));

function period(overrides: Partial<ResourceDeploymentPeriod>): ResourceDeploymentPeriod {
  return {
    startedAt: "2026-03-05T08:00:00",
    endedAt: null,
    schadenplatzId: "sp-1",
    formation: "FW",
    name: "Zug A",
    homeLocationName: null,
    deploymentLabel: null,
    hauptaufgabe: "",
    personnelCount: 10,
    ...overrides,
  };
}

function resource(overrides: Partial<Resource> & Pick<Resource, "id">): Resource {
  return {
    incidentId: "inc-1",
    schadenplatzId: "sp-1",
    formation: "FW",
    name: "",
    size: "GRUPPE",
    personnelCount: 0,
    hauptaufgabe: "",
    contact: null,
    homeLocation: null,
    deploymentLocation: null,
    status: "AUFGEBOTEN",
    statusAt: "2026-03-05T08:00:00",
    alertedAt: "2026-03-05T08:00:00",
    readyAt: null,
    deployedAt: null,
    stoodDownAt: null,
    relievedAt: null,
    einsatzBeginn: null,
    einsatzEnde: null,
    predecessorId: null,
    successorId: null,
    sourceMessageId: null,
    deploymentHistory: [],
    ...overrides,
  };
}

/** The cell texts of every body row, in order. */
function bodyRows(): string[][] {
  const [, body] = screen.getAllByRole("rowgroup");
  return within(body)
    .getAllByRole("row")
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent ?? ""),
    );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ResourceTable", () => {
  // Keep this first: React reports a missing key only once per component, so any earlier render
  // of rows would swallow the warning.
  it("renders rows without React key warnings", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ResourceTable
        resources={[resource({ id: "a", name: "A" }), resource({ id: "b", name: "B" })]}
      />,
    );

    expect(errors.mock.calls.flat().join(" ")).not.toContain('unique "key"');
  });

  it("titles the table, with the incident name when there is one", () => {
    const { rerender } = render(<ResourceTable resources={[]} incidentName="Hauptereignis" />);
    expect(
      screen.getByRole("heading", { name: `${de.resource.mitteltabelle} — Hauptereignis` }),
    ).toBeInTheDocument();

    rerender(<ResourceTable resources={[]} />);
    expect(screen.getByRole("heading", { name: de.resource.mitteltabelle })).toBeInTheDocument();
  });

  it("has the column headers", () => {
    render(<ResourceTable resources={[]} />);

    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      de.resource.fields.partner,
      de.resource.fields.name,
      de.resource.fields.personnelCount,
      de.resource.fields.status,
      de.resource.alertedAt,
      de.resource.readyAt,
      de.resource.deployedAt,
      de.resource.relievedAt,
      de.resource.fields.hauptaufgabe,
      de.resource.fields.deploymentLocation,
    ]);
  });

  it("forwards its ref to the printable container", () => {
    const ref = createRef<HTMLDivElement>();
    render(<ResourceTable ref={ref} resources={[]} />);

    expect(ref.current).toContainElement(screen.getByRole("table"));
  });

  it("lists the resources sorted by name, with the formation qualified by the home location", () => {
    render(
      <ResourceTable
        resources={[
          resource({ id: "b", name: "Zug B", formation: "SAN", personnelCount: 4 }),
          resource({
            id: "a",
            name: "Gruppe A",
            formation: "FW",
            personnelCount: 8,
            status: "EINSATZBEREIT",
            alertedAt: "2026-03-05T08:00:00",
            readyAt: "2026-03-05T08:30:00",
            homeLocation: { name: "Altdorf", lat: null, lng: null },
          }),
        ]}
      />,
    );

    const rows = bodyRows();
    expect(rows.map((r) => r[1])).toEqual(["Gruppe A", "Zug B"]);
    expect(rows[0]).toEqual([
      `${de.resource.formation.FW} Altdorf`,
      "Gruppe A",
      "8",
      de.resource.status.EINSATZBEREIT,
      "05.03.2026 08:00",
      "05.03.2026 08:30",
      "–",
      "–",
      "–",
      "–",
    ]);
    expect(rows[1][0]).toBe(de.resource.formation.SAN);
  });

  it("shows a dash for a resource without a name", () => {
    render(<ResourceTable resources={[resource({ id: "x" })]} />);

    expect(bodyRows()[0][1]).toBe("–");
  });

  it("takes the deployment dates and place from the resource when it has no history", () => {
    render(
      <ResourceTable
        resources={[
          resource({
            id: "x",
            name: "Zug A",
            status: "ABGELOEST",
            deployedAt: "2026-03-05T09:00:00",
            relievedAt: "2026-03-05T11:00:00",
            hauptaufgabe: "Brandbekämpfung",
            deploymentLocation: { lat: null, lng: null, label: "Nordflanke" },
          }),
        ]}
      />,
    );

    const row = bodyRows()[0];
    expect(row.slice(6)).toEqual([
      "05.03.2026 09:00",
      "05.03.2026 11:00",
      "Brandbekämpfung",
      "Nordflanke",
    ]);
  });

  it("uses the ongoing period as the primary row and lists the completed ones below it", () => {
    render(
      <ResourceTable
        resources={[
          resource({
            id: "x",
            name: "Zug A",
            status: "EINGESETZT",
            deploymentLocation: { lat: null, lng: null, label: "Aktueller Ort" },
            deploymentHistory: [
              period({
                startedAt: "2026-03-05T08:00:00",
                endedAt: "2026-03-05T10:00:00",
                deploymentLabel: "Erster Ort",
                hauptaufgabe: "Absperrung",
              }),
              period({
                startedAt: "2026-03-05T11:00:00",
                endedAt: null,
                deploymentLabel: "Aktueller Ort",
                hauptaufgabe: "Rettung",
              }),
            ],
          }),
        ]}
      />,
    );

    const rows = bodyRows();
    expect(rows).toHaveLength(2);
    // Primary: the open period. No end, the current place.
    expect(rows[0].slice(6)).toEqual(["05.03.2026 11:00", "–", "Rettung", "Aktueller Ort"]);
    // History row: only the period's own columns are filled.
    expect(rows[1].slice(0, 6)).toEqual(["", "", "", "", "", ""]);
    expect(rows[1].slice(6)).toEqual([
      "05.03.2026 08:00",
      "05.03.2026 10:00",
      "Absperrung",
      "Erster Ort",
    ]);
  });

  it("uses the most recent completed period as primary when nothing is ongoing", () => {
    render(
      <ResourceTable
        resources={[
          resource({
            id: "x",
            name: "Zug A",
            status: "ABGELOEST",
            deploymentHistory: [
              period({
                startedAt: "2026-03-05T13:00:00",
                endedAt: "2026-03-05T14:00:00",
                deploymentLabel: "Zweiter Ort",
              }),
              period({
                startedAt: "2026-03-05T08:00:00",
                endedAt: "2026-03-05T10:00:00",
                deploymentLabel: "Erster Ort",
              }),
            ],
          }),
        ]}
      />,
    );

    const rows = bodyRows();
    expect(rows).toHaveLength(2);
    expect(rows[0].slice(6, 8)).toEqual(["05.03.2026 13:00", "05.03.2026 14:00"]);
    expect(rows[0][9]).toBe("Zweiter Ort");
    expect(rows[1].slice(6, 8)).toEqual(["05.03.2026 08:00", "05.03.2026 10:00"]);
    expect(rows[1][9]).toBe("Erster Ort");
  });
});
