import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIncidentDetails, useIncidentResources } from "api";
import type { IncidentResourcesData, Resource } from "api";
import { ApiError } from "api/errors";
import { errorResult, loadingResult, readyResult } from "api/testing/results";
import de from "../../i18n/locales/de/translations.json";
import en from "../../i18n/locales/en/translations.json";
import fr from "../../i18n/locales/fr/translations.json";
import it_ from "../../i18n/locales/it/translations.json";
import List from "./List";

// The real locale files, so a missing translation fails the test.
const locales: Record<string, unknown> = { de, en, fr, it: it_ };
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

let iconsLoaded = true;
vi.mock("components/babs/useBabsIcons", () => ({ useBabsIcons: () => iconsLoaded }));

// The icon provider picks the graphics per language; expose both so the test can read them.
vi.mock("@f-eld-ch/babs-react", () => ({
  BabsIconProvider: ({ lang, children }: { lang: string; children: ReactNode }) => (
    <div data-testid="babs-provider" data-lang={lang}>
      {children}
    </div>
  ),
  BabsIcon: ({ icon }: { icon: string }) => <span data-testid="babs-icon" data-icon={icon} />,
}));

const print = vi.fn();
vi.mock("react-to-print", () => ({ useReactToPrint: () => print }));

vi.mock("api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("api")>()),
  useIncidentResources: vi.fn(),
  useIncidentDetails: vi.fn(),
}));

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

const zugA = resource({
  id: "r1",
  formation: "FW",
  name: "Zug A",
  size: "ZUG",
  personnelCount: 20,
  status: "EINGESETZT",
  homeLocation: { name: "Altdorf", lat: null, lng: null },
  contact: { medium: "RADIO", detail: "Kanal 5" },
  hauptaufgabe: "Brandbekämpfung",
  deployedAt: "2026-03-05T09:15:00",
  deploymentLocation: { lat: null, lng: null, label: "Nordflanke" },
  deploymentHistory: [
    {
      startedAt: "2026-03-05T08:00:00",
      endedAt: "2026-03-05T12:30:00",
      schadenplatzId: "sp-1",
      formation: "FW",
      name: "Zug A",
      homeLocationName: "Altdorf",
      deploymentLabel: "Südflanke",
      hauptaufgabe: "Absperrung",
      personnelCount: 20,
    },
    {
      startedAt: "2026-03-05T13:00:00",
      endedAt: null,
      schadenplatzId: "sp-1",
      formation: "FW",
      name: "Zug A",
      homeLocationName: "Altdorf",
      deploymentLabel: "Nordflanke",
      hauptaufgabe: "Brandbekämpfung",
      personnelCount: 20,
    },
  ],
});
const gruppeB = resource({
  id: "r2",
  formation: "FW",
  name: "Gruppe B",
  size: "GRUPPE",
  personnelCount: 8,
  status: "AUFGEBOTEN",
  homeLocation: { name: "Altdorf", lat: null, lng: null },
});
const truppC = resource({
  id: "r3",
  formation: "FW",
  name: "Trupp C",
  size: "TRUPP",
  personnelCount: 3,
  status: "ABGELOEST",
  homeLocation: { name: "Erstfeld", lat: null, lng: null },
  relievedAt: "2026-03-05T14:45:00",
  successorId: "r1",
});
const sanitaet = resource({
  id: "r4",
  formation: "SAN",
  name: "",
  size: "ZUG",
  personnelCount: 5,
  status: "EINSATZBEREIT",
});
const polizeiChild = resource({
  id: "r5",
  incidentId: "inc-2",
  formation: "POL",
  name: "Patrouille",
  size: "KOMPANIE",
  personnelCount: 12,
  status: "EINGESETZT",
});

function data(resources: Resource[], childIncidents = true): IncidentResourcesData {
  return {
    incidentId: "inc-1",
    incidentName: "Hauptereignis",
    schadenplaetze: [],
    childIncidents: childIncidents
      ? [
          {
            id: "inc-2",
            name: "Kind-Ereignis",
            casualties: {
              vermisste: 0,
              tote: 0,
              verletzte: 0,
              obdachlose: 0,
              eingeschlossene: 0,
            },
            hasCasualtyRecords: false,
          },
        ]
      : [],
    resources,
    hasCasualtyRecords: false,
  } as IncidentResourcesData;
}

function renderList() {
  return render(
    <MemoryRouter initialEntries={["/incident/inc-1/resources"]}>
      <Routes>
        <Route path="/incident/:incidentId/resources" element={<List />} />
        <Route path="/incident/:incidentId/journal/triage" element={<p>triage page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockResources(resources: Resource[]) {
  vi.mocked(useIncidentResources).mockReturnValue(readyResult(data(resources)));
}

/** The visible Mitteltabelle (the second table is the hidden print version). */
function mitteltabelle() {
  return screen.getAllByRole("table")[0];
}

function kpiCard(formationLabel: string) {
  const heading = screen.getByRole("heading", { level: 2, name: formationLabel });
  return heading.closest("section") as HTMLElement;
}

function rowOf(table: HTMLElement, name: string) {
  return within(table).getByText(name).closest("tr") as HTMLElement;
}

describe("resource List", () => {
  beforeEach(() => {
    language = "de";
    iconsLoaded = true;
    print.mockClear();
    vi.mocked(useIncidentDetails).mockReturnValue(
      loadingResult() as ReturnType<typeof useIncidentDetails>,
    );
    mockResources([zugA, gruppeB, truppC, sanitaet, polizeiChild]);
  });

  describe("states", () => {
    it("shows a spinner while loading", () => {
      vi.mocked(useIncidentResources).mockReturnValue(loadingResult());
      const { container } = renderList();

      expect(container.querySelector(".fa-spin")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("shows the translated error", () => {
      vi.mocked(useIncidentResources).mockReturnValue(errorResult(new ApiError("NETWORK_ERROR")));
      renderList();

      expect(screen.getByText(de.errors.NETWORK_ERROR)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: de.resources })).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("points to the triage when there are no resources, and has nothing to print", () => {
      mockResources([]);
      renderList();

      expect(screen.getByText(de.resource.noResources)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: de.print })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: de.triageView }));
      expect(screen.getByText("triage page")).toBeInTheDocument();
    });
  });

  describe("formation KPI cards", () => {
    it("shows one card per formation in the fixed order, leaving out formations without resources", () => {
      renderList();

      const headings = screen
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent)
        .filter((text) => text !== de.resource.mitteltabelle);
      expect(headings).toEqual([
        de.resource.formation.FW,
        de.resource.formation.SAN,
        de.resource.formation.POL,
      ]);
    });

    it("counts only deployed personnel as the figure and lists every status as a badge", () => {
      renderList();

      const fw = within(kpiCard(de.resource.formation.FW));
      expect(fw.getByText("20")).toBeInTheDocument();
      expect(fw.getByText(`20 ${de.resource.status.EINGESETZT}`)).toBeInTheDocument();
      expect(fw.getByText(`8 ${de.resource.status.AUFGEBOTEN}`)).toBeInTheDocument();
    });

    it("leaves relieved resources out of the card", () => {
      renderList();

      const fw = within(kpiCard(de.resource.formation.FW));
      expect(fw.queryByText(new RegExp(de.resource.status.ABGELOEST))).not.toBeInTheDocument();
    });

    it("shows 0 for a formation where nobody is deployed yet", () => {
      renderList();

      const san = within(kpiCard(de.resource.formation.SAN));
      expect(san.getByText("0")).toBeInTheDocument();
      expect(san.getByText(`5 ${de.resource.status.EINSATZBEREIT}`)).toBeInTheDocument();
    });

    it("includes the resources of child incidents", () => {
      renderList();

      const pol = within(kpiCard(de.resource.formation.POL));
      expect(pol.getByText("12")).toBeInTheDocument();
    });

    it("uses the partner icon, or the formation code until the icons are loaded", () => {
      const { unmount } = renderList();
      const card = within(kpiCard(de.resource.formation.FW));
      expect(card.getByTestId("babs-icon")).toHaveAttribute("data-icon", "4702");
      expect(within(kpiCard(de.resource.formation.SAN)).getByTestId("babs-icon")).toHaveAttribute(
        "data-icon",
        "4703",
      );
      unmount();

      iconsLoaded = false;
      renderList();
      const pending = within(kpiCard(de.resource.formation.FW));
      expect(pending.queryByTestId("babs-icon")).not.toBeInTheDocument();
      expect(pending.getByText("FW")).toBeInTheDocument();
    });
  });

  describe("icon language", () => {
    it.each([
      ["de", de],
      ["fr", fr],
      ["it", it_],
      ["en", en],
    ])("hands %s to the icon provider and translates the headings", (lang, locale) => {
      language = lang;
      renderList();

      expect(screen.getByTestId("babs-provider")).toHaveAttribute("data-lang", lang);
      expect(
        screen.getByRole("heading", { level: 2, name: locale.resource.formation.FW }),
      ).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: locale.resources })).toBeInTheDocument();
    });
  });

  describe("Mitteltabelle grouping", () => {
    it("groups the own incident by formation and home location, sorted by location", () => {
      renderList();
      const table = within(mitteltabelle());

      // The own incident, its formations and home locations are open by default.
      expect(table.getByRole("button", { name: "Hauptereignis" })).toBeInTheDocument();
      expect(table.getByRole("button", { name: de.resource.formation.FW })).toBeInTheDocument();
      expect(table.getByRole("button", { name: de.resource.formation.SAN })).toBeInTheDocument();

      const order = ["Altdorf", "Erstfeld"].map((name) =>
        table.getByRole("button", { name }).compareDocumentPosition(table.getByText("Trupp C")),
      );
      // Altdorf comes before "Trupp C" (in Erstfeld), and Erstfeld's own row precedes it too.
      expect(order[0] & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(order[1] & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(
        table
          .getByRole("button", { name: "Altdorf" })
          .compareDocumentPosition(table.getByRole("button", { name: "Erstfeld" })) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("lists resources without a home location under a dash", () => {
      renderList();

      expect(within(mitteltabelle()).getByRole("button", { name: "–" })).toBeInTheDocument();
    });

    it("sorts the resources of a location by name", () => {
      renderList();
      const table = within(mitteltabelle());

      expect(
        table.getByText("Gruppe B").compareDocumentPosition(table.getByText("Zug A")) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("marks child incidents; they start open with their formations collapsed to totals", () => {
      renderList();
      const table = within(mitteltabelle());

      const row = table.getByRole("button", { name: "Kind-Ereignis" }).closest("tr")!;
      expect(within(row).getByText(de.resource.childIncident)).toBeInTheDocument();
      // Open: the incident row carries no sum, its formation row does.
      expect(within(row).queryByText("12")).not.toBeInTheDocument();
      const pol = table.getByRole("button", { name: de.resource.formation.POL }).closest("tr")!;
      expect(within(pol).getByText("12")).toBeInTheDocument();
      expect(within(pol).getByText(`12 ${de.resource.status.EINGESETZT}`)).toBeInTheDocument();
      expect(table.queryByText("Patrouille")).not.toBeInTheDocument();
    });

    it("collapses a child incident into its deployed personnel and status badges", () => {
      renderList();
      const table = within(mitteltabelle());
      const button = table.getByRole("button", { name: "Kind-Ereignis" });

      fireEvent.click(button);
      const row = within(button.closest("tr")!);
      expect(row.getByText("12")).toBeInTheDocument();
      expect(row.getByText(`12 ${de.resource.status.EINGESETZT}`)).toBeInTheDocument();
      expect(table.queryByRole("button", { name: de.resource.formation.POL })).toBeNull();

      fireEvent.click(button);
      expect(table.getByRole("button", { name: de.resource.formation.POL })).toBeInTheDocument();
    });

    it("expands a child incident's formation and home location down to its resources", () => {
      renderList();
      const table = within(mitteltabelle());

      fireEvent.click(table.getByRole("button", { name: de.resource.formation.POL }));
      fireEvent.click(table.getAllByRole("button", { name: "–" }).at(-1)!);
      expect(table.getByText("Patrouille")).toBeInTheDocument();
    });

    it("collapses a formation into its totals and opens it again", () => {
      renderList();
      const table = within(mitteltabelle());
      const fwButton = table.getByRole("button", { name: de.resource.formation.FW });

      fireEvent.click(fwButton);
      const row = fwButton.closest("tr")!;
      expect(within(row).getByText("20")).toBeInTheDocument();
      expect(within(row).getByText(`8 ${de.resource.status.AUFGEBOTEN}`)).toBeInTheDocument();
      expect(table.queryByText("Zug A")).not.toBeInTheDocument();

      fireEvent.click(fwButton);
      expect(table.getByText("Zug A")).toBeInTheDocument();
    });

    it("collapses a home location into its totals", () => {
      renderList();
      const table = within(mitteltabelle());
      const altdorf = table.getByRole("button", { name: "Altdorf" });

      fireEvent.click(altdorf);

      expect(within(altdorf.closest("tr")!).getByText("20")).toBeInTheDocument();
      expect(table.queryByText("Zug A")).not.toBeInTheDocument();
      expect(table.queryByText("Gruppe B")).not.toBeInTheDocument();
      expect(table.getByText("Trupp C")).toBeInTheDocument();
    });

    it("keeps the own incident open when its row is clicked", () => {
      renderList();
      const table = within(mitteltabelle());

      fireEvent.click(table.getByRole("button", { name: "Hauptereignis" }));
      expect(table.getByText("Zug A")).toBeInTheDocument();
    });
  });

  describe("Mitteltabelle rows", () => {
    it("shows the resource's figures", () => {
      renderList();
      const row = within(rowOf(mitteltabelle(), "Zug A"));

      expect(row.getByText("20")).toBeInTheDocument();
      expect(row.getByText(de.resource.status.EINGESETZT)).toBeInTheDocument();
      expect(row.getByText(`${de.medium.RADIO}: Kanal 5`)).toBeInTheDocument();
      expect(row.getByText("05.03.2026 08:00")).toBeInTheDocument();
      expect(row.getByText("05.03.2026 09:15")).toBeInTheDocument();
      expect(row.getByText("Brandbekämpfung")).toBeInTheDocument();
      expect(row.getByText("Nordflanke")).toBeInTheDocument();
    });

    it("shows dashes for what is not known", () => {
      renderList();
      const row = within(rowOf(mitteltabelle(), "Gruppe B"));

      // contact, ready, deployed, relieved, hauptaufgabe, location
      expect(row.getAllByText("–")).toHaveLength(6);
    });

    it("falls back to the unit size when the resource has no name", () => {
      renderList();

      expect(within(mitteltabelle()).getByText(de.resource.size.ZUG)).toBeInTheDocument();
    });

    it("omits the contact detail when there is none", () => {
      mockResources([
        resource({ id: "x", name: "Funk", contact: { medium: "PHONE", detail: "" } }),
      ]);
      renderList();

      expect(within(mitteltabelle()).getByText(de.medium.PHONE)).toBeInTheDocument();
    });

    it("names the successor of a relieved resource", () => {
      renderList();
      const row = within(rowOf(mitteltabelle(), "Trupp C"));

      expect(row.getByText("05.03.2026 14:45", { exact: false })).toBeInTheDocument();
      expect(
        row.getByText(
          `${de.resource.fields.relievedThrough}: ${de.resource.formation.FW} Altdorf, Zug A`,
          { exact: false },
        ),
      ).toBeInTheDocument();
    });

    it("names an unnamed successor by its unit size", () => {
      mockResources([
        resource({ id: "old", name: "Alt", status: "ABGELOEST", successorId: "new" }),
        resource({ id: "new", name: "", size: "ZUG", formation: "POL" }),
      ]);
      renderList();

      expect(
        within(mitteltabelle()).getByText(
          `${de.resource.fields.relievedThrough}: ${de.resource.formation.POL}, ${de.resource.size.ZUG}`,
          { exact: false },
        ),
      ).toBeInTheDocument();
    });

    it("expands the deployment history of a resource with several periods", () => {
      renderList();
      const table = within(mitteltabelle());

      // Only a resource with more than one period gets the toggle.
      expect(table.queryByRole("button", { name: "Gruppe B" })).not.toBeInTheDocument();
      expect(table.queryByText("Südflanke")).not.toBeInTheDocument();

      const toggle = table.getByRole("button", { name: "Zug A" });
      fireEvent.click(toggle);

      const south = within(table.getByText("Südflanke").closest("tr")!);
      expect(south.getByText("05.03.2026 08:00")).toBeInTheDocument();
      expect(south.getByText("05.03.2026 12:30")).toBeInTheDocument();
      expect(south.getByText("Absperrung")).toBeInTheDocument();
      // Both periods are listed, the current one with its open end.
      expect(table.getAllByText("Nordflanke")).toHaveLength(2);

      fireEvent.click(toggle);
      expect(table.queryByText("Südflanke")).not.toBeInTheDocument();
    });
  });

  describe("combined BABS icon", () => {
    it.each([
      ["Trupp C", "4201"],
      ["Gruppe B", "4202"],
      ["Zug A", "4203"],
    ])("uses the formation prefix and unit size for %s: %s", (name, id) => {
      renderList();

      expect(within(rowOf(mitteltabelle(), name)).getByTestId("babs-icon")).toHaveAttribute(
        "data-icon",
        id,
      );
    });

    it("maps every formation prefix and unit size", () => {
      const cases: [Resource["formation"], Resource["size"], string][] = [
        ["POL", "TRUPP", "4101"],
        ["SAN", "ZUG", "4303"],
        ["ZS", "KOMPANIE", "4404"],
        ["TECHNB", "BATAILLON", "4505"],
        ["ARMEE", "GRUPPE", "4602"],
        ["OTHER", "ZUG", "4803"],
      ];
      mockResources(
        cases.map(([formation, size], i) =>
          resource({ id: `c${i}`, name: `R${i}`, formation, size }),
        ),
      );
      renderList();

      cases.forEach(([, , id], i) => {
        expect(within(rowOf(mitteltabelle(), `R${i}`)).getByTestId("babs-icon")).toHaveAttribute(
          "data-icon",
          id,
        );
      });
    });

    it("shows the formation code while the icons are loading", () => {
      iconsLoaded = false;
      renderList();

      const row = within(rowOf(mitteltabelle(), "Zug A"));
      expect(row.queryByTestId("babs-icon")).not.toBeInTheDocument();
      expect(row.getByText("FW")).toBeInTheDocument();
    });

    it("uses the partner icon on the formation row", () => {
      renderList();

      const row = within(
        within(mitteltabelle())
          .getByRole("button", { name: de.resource.formation.FW })
          .closest("tr")!,
      );
      expect(row.getByTestId("babs-icon")).toHaveAttribute("data-icon", "4702");
    });
  });

  describe("printing", () => {
    it("prints the hidden table, titled with the incident name", () => {
      vi.mocked(useIncidentDetails).mockReturnValue(
        readyResult({ incident: { name: "Hauptereignis" } }) as ReturnType<
          typeof useIncidentDetails
        >,
      );
      renderList();

      expect(
        screen.getByRole("heading", {
          level: 1,
          name: `${de.resource.mitteltabelle} — Hauptereignis`,
        }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: de.print }));
      expect(print).toHaveBeenCalledTimes(1);
    });

    it("titles the print version with the table name alone while the incident loads", () => {
      renderList();

      expect(
        screen.getByRole("heading", { level: 1, name: de.resource.mitteltabelle }),
      ).toBeInTheDocument();
    });
  });
});
