import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIncidentResources } from "api";
import type { IncidentResourcesData, SchadenplatzWithResources } from "api";
import { ApiError } from "api/errors";
import { errorResult, loadingResult, readyResult } from "api/testing/results";
import de from "../../i18n/locales/de/translations.json";
import fr from "../../i18n/locales/fr/translations.json";
import { List } from "./List";

// The real locale files, so a missing translation fails the test.
const locales: Record<string, unknown> = { de, fr };
let language = "de";

function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      locales[language],
    );
  return typeof value === "string" ? value : key;
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: lookup, i18n: { language, resolvedLanguage: language } }),
}));

vi.mock("components/babs/useBabsIcons", () => ({ useBabsIcons: () => true }));
vi.mock("@f-eld-ch/babs-react", () => ({
  BabsIconProvider: ({ lang, children }: { lang: string; children: ReactNode }) => (
    <div data-testid="babs-provider" data-lang={lang}>
      {children}
    </div>
  ),
  BabsIcon: ({ icon }: { icon: string }) => <span data-testid="babs-icon" data-icon={icon} />,
}));

vi.mock("api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("api")>()),
  useIncidentResources: vi.fn(),
}));

type Totals = SchadenplatzWithResources["casualties"];
const none: Totals = { vermisste: 0, tote: 0, verletzte: 0, obdachlose: 0, eingeschlossene: 0 };

function sp(overrides: Partial<SchadenplatzWithResources> & { id: string }) {
  return {
    incidentId: "inc-1",
    name: "",
    isDefault: false,
    isMerged: false,
    mergedInto: null,
    casualties: none,
    resources: [],
    ...overrides,
  } as SchadenplatzWithResources;
}

function setData(overrides: Partial<IncidentResourcesData>) {
  vi.mocked(useIncidentResources).mockReturnValue(
    readyResult({
      incidentId: "inc-1",
      incidentName: "Hauptereignis",
      schadenplaetze: [],
      childIncidents: [],
      resources: [],
      hasCasualtyRecords: true,
      ...overrides,
    } as IncidentResourcesData),
  );
}

function renderList() {
  return render(
    <MemoryRouter initialEntries={["/incident/inc-1/casualties"]}>
      <Routes>
        <Route path="/incident/:incidentId/casualties" element={<List />} />
        <Route path="/incident/:incidentId/journal/triage" element={<p>triage page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const CATEGORIES = ["verletzte", "vermisste", "obdachlose", "eingeschlossene", "tote"] as const;

/** The category figures of a block, as category to count. */
function figures(block: HTMLElement): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of CATEGORIES) {
    const label = within(block).getByText(de.casualties[key]);
    const row = label.closest("section, div.flex") as HTMLElement;
    result[key] = (row.textContent ?? "").replace(de.casualties[key], "").trim();
  }
  return result;
}

function card(title: string): HTMLElement {
  return screen.getByRole("heading", { level: 3, name: title }).parentElement as HTMLElement;
}

describe("casualties List", () => {
  beforeEach(() => {
    language = "de";
  });

  it("shows a spinner while loading", () => {
    vi.mocked(useIncidentResources).mockReturnValue(loadingResult());
    const { container } = renderList();

    expect(container.querySelector(".fa-spin")).toBeInTheDocument();
  });

  it("shows the generic error", () => {
    vi.mocked(useIncidentResources).mockReturnValue(errorResult(new ApiError("NETWORK_ERROR")));
    renderList();

    expect(screen.getByText(de.errors.UNKNOWN)).toBeInTheDocument();
  });

  it("points to the triage while no casualties were recorded", () => {
    setData({ hasCasualtyRecords: false });
    renderList();

    expect(screen.getByText(de.casualties.none)).toBeInTheDocument();
    expect(screen.getByText(de.casualties.noneHint)).toBeInTheDocument();
    expect(screen.queryByText(de.casualties.thisIncident)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: de.triageView }));
    expect(screen.getByText("triage page")).toBeInTheDocument();
  });

  it("totals the own Schadenplätze and the child incidents, leaving merged ones out", () => {
    setData({
      schadenplaetze: [
        sp({ id: "a", name: "Nord", casualties: { ...none, verletzte: 2, tote: 1 } }),
        sp({ id: "b", name: "Süd", casualties: { ...none, verletzte: 3, vermisste: 4 } }),
        sp({
          id: "c",
          name: "Zusammengelegt",
          isMerged: true,
          mergedInto: "a",
          casualties: { ...none, verletzte: 100 },
        }),
      ],
      childIncidents: [
        {
          id: "inc-2",
          name: "Kind",
          casualties: { ...none, obdachlose: 7, verletzte: 10 },
          hasCasualtyRecords: true,
        },
      ],
    });
    renderList();

    // The first grid is the grand total, in front of the headings.
    const heading = screen.getByRole("heading", { name: de.casualties.overview });
    const total = heading.nextElementSibling as HTMLElement;
    expect(figures(total)).toEqual({
      verletzte: "15",
      vermisste: "4",
      obdachlose: "7",
      eingeschlossene: "0",
      tote: "1",
    });
  });

  it("lists the Schadenplätze of this incident and the child incidents with their own figures", () => {
    setData({
      schadenplaetze: [
        sp({ id: "a", name: "Nord", casualties: { ...none, verletzte: 2 } }),
        sp({ id: "m", name: "Zusammengelegt", isMerged: true }),
      ],
      childIncidents: [
        { id: "inc-2", name: "Kind", casualties: { ...none, tote: 3 }, hasCasualtyRecords: true },
      ],
    });
    renderList();

    expect(screen.getByRole("heading", { name: de.casualties.thisIncident })).toBeInTheDocument();
    expect(figures(card("Nord")).verletzte).toBe("2");
    expect(screen.queryByRole("heading", { name: "Zusammengelegt" })).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: de.casualties.childIncidents })).toBeInTheDocument();
    expect(figures(card("Kind")).tote).toBe("3");
  });

  it("shows the default Schadenplatz under the incident name once it holds casualties", () => {
    setData({
      schadenplaetze: [
        sp({ id: "d", isDefault: true, casualties: { ...none, vermisste: 5 } }),
        sp({ id: "a", name: "Nord" }),
      ],
    });
    renderList();

    expect(figures(card("Hauptereignis")).vermisste).toBe("5");
    expect(card("Nord")).toBeInTheDocument();
  });

  it("hides an empty default Schadenplatz", () => {
    setData({
      schadenplaetze: [sp({ id: "d", isDefault: true }), sp({ id: "a", name: "Nord" })],
    });
    renderList();

    expect(screen.queryByRole("heading", { level: 3, name: "Hauptereignis" })).toBeNull();
    expect(card("Nord")).toBeInTheDocument();
  });

  it("counts casualties recorded only in a child incident as recorded", () => {
    setData({
      hasCasualtyRecords: false,
      childIncidents: [
        { id: "inc-2", name: "Kind", casualties: { ...none, tote: 2 }, hasCasualtyRecords: true },
      ],
    });
    renderList();

    expect(screen.queryByText(de.casualties.none)).not.toBeInTheDocument();
    expect(figures(card("Kind")).tote).toBe("2");
  });

  it("hands the language to the icon provider", () => {
    language = "fr";
    setData({});
    renderList();

    expect(screen.getByTestId("babs-provider")).toHaveAttribute("data-lang", "fr");
    expect(screen.getByRole("heading", { name: fr.casualties.overview })).toBeInTheDocument();
  });
});
