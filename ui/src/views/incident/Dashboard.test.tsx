import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncidentContext as IncidentContextState } from "types";
import { PriorityStatus, TriageStatus } from "types";
import type { Message } from "types/journal";
import { ApiError } from "../../api/errors";
import { errorResult, loadingResult, readyResult } from "../../api/testing/results";
import de from "../../i18n/locales/de/translations.json";
import fr from "../../i18n/locales/fr/translations.json";
import it_ from "../../i18n/locales/it/translations.json";
import { IncidentContext } from "../../utils/IncidentContext";
import Dashboard from "./Dashboard";

// The real locale files, so a missing translation fails the test.
const locales: Record<string, unknown> = { de, fr, it: it_ };
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

const api = vi.hoisted(() => ({
  useIncidentResources: vi.fn(),
  useIncidentMessages: vi.fn(),
  useFeatureChangeTimes: vi.fn(),
}));
vi.mock("api", () => api);

const featureIds = vi.hoisted(() => ({ value: undefined as string[] | undefined }));
vi.mock("views/map/useFeatureMessageIds", () => ({
  useFeatureMessageIds: () => featureIds.value,
}));
vi.mock("components/babs/useBabsIcons", () => ({ useBabsIcons: () => false }));
vi.mock("@f-eld-ch/babs-react", () => ({
  BabsIconProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  BabsIcon: () => null,
}));

// The map, the message stack, the message sheet and the slider are tested on their own: here they
// only report what the dashboard hands them and let the test trigger its callbacks.
vi.mock("views/map", () => ({
  Map: (props: {
    asOf?: Date;
    onFeatureSelect: (id: string | undefined, incidentId?: string) => void;
    deselectToken: number;
  }) => (
    <div>
      <p>map asOf={props.asOf ? props.asOf.toISOString() : "live"}</p>
      <p>deselect token {props.deselectToken}</p>
      <button onClick={() => props.onFeatureSelect("f1", "i1")}>select own feature</button>
      <button onClick={() => props.onFeatureSelect("f2", "child")}>select child feature</button>
      <button onClick={() => props.onFeatureSelect(undefined)}>deselect feature</button>
    </div>
  ),
}));
vi.mock("views/journal/FilterableMessageStack", () => ({
  FilterableMessageStack: (props: {
    messages: Message[];
    effectiveId?: string;
    focusMessageIds?: string[];
    onSelect: (id: string | undefined) => void;
    onClearFocus: () => void;
  }) => (
    <div>
      <p>stack: {props.messages.map((m) => m.id).join(",") || "empty"}</p>
      <p>stack selected: {props.effectiveId ?? "none"}</p>
      <p>stack focus: {props.focusMessageIds?.join(",") ?? "none"}</p>
      <button onClick={() => props.onSelect("m-normal")}>pick m-normal</button>
      <button onClick={() => props.onSelect(undefined)}>pick nothing</button>
      <button onClick={props.onClearFocus}>clear focus</button>
    </div>
  ),
}));
vi.mock("views/journal/Message", () => ({
  default: (props: { id: string }) => <p>sheet of {props.id}</p>,
}));
vi.mock("views/map/controls/TimelineSlider", () => ({
  TimelineSlider: (props: {
    start?: Date;
    tickTimes: number[];
    onAsOfChange: (asOf: Date | undefined) => void;
  }) => (
    <div>
      <p>slider start {props.start ? props.start.toISOString() : "none"}</p>
      <p>ticks {props.tickTimes.join(",")}</p>
      <button onClick={() => props.onAsOfChange(new Date("2024-05-01T10:00:00Z"))}>
        go to the past
      </button>
    </div>
  ),
}));

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    number: 1,
    content: "",
    sender: "",
    senderDetail: "",
    receiver: "",
    receiverDetail: "",
    time: minutesAgo(5),
    createdAt: minutesAgo(5),
    updatedAt: minutesAgo(5),
    deletedAt: new Date(0),
    divisions: [],
    medium: "RADIO",
    triageId: TriageStatus.Triaged,
    priorityId: PriorityStatus.High,
    attachments: [],
    acknowledgements: [],
    author: "",
    ...overrides,
  } as Message;
}

const noCasualties = { vermisste: 0, tote: 0, verletzte: 0, obdachlose: 0, eingeschlossene: 0 };
const resource = (id: string, formation: string, status: string, personnelCount: number) => ({
  id,
  formation,
  status,
  personnelCount,
});

const baseResources = {
  incidentId: "i1",
  incidentName: "Hochwasser",
  schadenplaetze: [],
  childIncidents: [],
  resources: [],
  hasCasualtyRecords: false,
};

function renderDashboard(incident: Partial<IncidentContextState["incident"]> = {}) {
  const state = {
    incident: { id: "i1", createdAt: minutesAgo(600), ...incident },
    loadedForId: "i1",
  } as IncidentContextState;
  return render(
    <IncidentContext.Provider value={{ state, dispatch: () => null }}>
      <MemoryRouter initialEntries={["/incident/i1/dashboard"]}>
        <Routes>
          <Route path="/incident/:incidentId/dashboard" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>
    </IncidentContext.Provider>,
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    language = "de";
    featureIds.value = undefined;
    api.useIncidentResources.mockReturnValue(readyResult(baseResources));
    api.useIncidentMessages.mockReturnValue(readyResult({ messages: [] }));
    api.useFeatureChangeTimes.mockReturnValue([]);
  });

  describe("title", () => {
    it("names the incident once the resources are loaded", () => {
      renderDashboard();

      expect(screen.getByRole("heading", { name: "Ereignis Hochwasser" })).toBeInTheDocument();
    });

    it("falls back to the dashboard title while loading", () => {
      api.useIncidentResources.mockReturnValue(loadingResult());
      renderDashboard();

      expect(screen.getByRole("heading", { name: de.dashboard.title })).toBeInTheDocument();
    });
  });

  describe("KPI column", () => {
    it("shows a spinner column while the resources load", () => {
      api.useIncidentResources.mockReturnValue(loadingResult());
      renderDashboard();

      expect(screen.queryByText(de.casualties.overview)).not.toBeInTheDocument();
      expect(screen.getByText(/map asOf=live/)).toBeInTheDocument();
    });

    it("shows the translated error code when the resources fail", () => {
      api.useIncidentResources.mockReturnValue(errorResult(new ApiError("NETWORK_ERROR")));
      renderDashboard();

      expect(screen.getByText(de.errors.NETWORK_ERROR)).toBeInTheDocument();
    });

    it("leaves the column out when there are neither casualties nor resources", () => {
      renderDashboard();

      expect(screen.queryByText(de.casualties.overview)).not.toBeInTheDocument();
      expect(screen.queryByText(de.resources)).not.toBeInTheDocument();
    });

    it.each([
      ["de", de],
      ["fr", fr],
      ["it", it_],
    ])("shows the casualty totals of own and child incidents in %s", (lang, texts) => {
      language = lang;
      api.useIncidentResources.mockReturnValue(
        readyResult({
          ...baseResources,
          schadenplaetze: [
            { isMerged: false, casualties: { ...noCasualties, verletzte: 3, tote: 1 } },
            // a merged Schadenplatz is already counted in the one it was merged into
            { isMerged: true, casualties: { ...noCasualties, verletzte: 50 } },
          ],
          childIncidents: [
            {
              id: "child",
              name: "Sub",
              hasCasualtyRecords: false,
              casualties: { ...noCasualties, verletzte: 4 },
            },
          ],
        }),
      );
      renderDashboard();

      expect(screen.getByText(texts.casualties.overview)).toBeInTheDocument();
      const injured = screen.getByText(texts.casualties.verletzte);
      expect(injured.parentElement).toHaveTextContent("7");
      expect(screen.getByText(texts.casualties.tote).parentElement).toHaveTextContent("1");
    });

    it("says there are no casualties when only resources are shown", () => {
      api.useIncidentResources.mockReturnValue(
        readyResult({ ...baseResources, resources: [resource("r1", "FW", "EINGESETZT", 4)] }),
      );
      renderDashboard();

      expect(screen.getByText(de.casualties.none)).toBeInTheDocument();
    });

    it.each([
      ["own records", { hasCasualtyRecords: true }],
      [
        "records of a child incident",
        {
          childIncidents: [
            { id: "c", name: "c", casualties: noCasualties, hasCasualtyRecords: true },
          ],
        },
      ],
    ])("shows the casualty block for %s even when all totals are zero", (_n, extra) => {
      api.useIncidentResources.mockReturnValue(readyResult({ ...baseResources, ...extra }));
      renderDashboard();

      expect(screen.getByText(de.casualties.overview)).toBeInTheDocument();
      expect(screen.queryByText(de.casualties.none)).not.toBeInTheDocument();
    });

    it("groups resources by formation, counts deployed personnel and tags the statuses", () => {
      api.useIncidentResources.mockReturnValue(
        readyResult({
          ...baseResources,
          resources: [
            resource("r1", "FW", "EINGESETZT", 4),
            resource("r2", "FW", "EINSATZBEREIT", 6),
            resource("r3", "FW", "ABGELOEST", 9),
            resource("r4", "SAN", "AUFGEBOTEN", 2),
          ],
        }),
      );
      renderDashboard();

      expect(screen.getByText(de.resources)).toBeInTheDocument();
      const fire = screen.getByText(de.resource.formation.FW).closest("div")?.parentElement;
      // only deployed ones are counted in the figure
      expect(fire).toHaveTextContent(/^.*4/);
      expect(screen.getByText(`4 ${de.resource.status.EINGESETZT}`)).toBeInTheDocument();
      expect(screen.getByText(`6 ${de.resource.status.EINSATZBEREIT}`)).toBeInTheDocument();
      // relieved resources are left out
      expect(screen.queryByText(`9 ${de.resource.status.ABGELOEST}`)).not.toBeInTheDocument();
      expect(screen.getByText(de.resource.formation.SAN)).toBeInTheDocument();
      expect(screen.queryByText(de.resource.formation.POL)).not.toBeInTheDocument();
    });

    it("dims the previous figures while a past view is loading", () => {
      api.useIncidentResources.mockReturnValue({
        ...readyResult({ ...baseResources, hasCasualtyRecords: true }),
        isRefreshing: true,
      });
      renderDashboard();

      expect(screen.getByRole("complementary")).toHaveAttribute("aria-busy", "true");
    });
  });

  describe("messages", () => {
    it("shows a spinner while loading and the translated error when they fail", () => {
      api.useIncidentMessages.mockReturnValue(loadingResult());
      const { unmount } = renderDashboard();
      expect(screen.queryByText(/^stack:/)).not.toBeInTheDocument();
      unmount();

      api.useIncidentMessages.mockReturnValue(errorResult(new ApiError("FORBIDDEN")));
      renderDashboard();
      expect(screen.getByText(de.errors.FORBIDDEN)).toBeInTheDocument();
    });

    it("selects the latest recent key message and shows its sheet", () => {
      api.useIncidentMessages.mockReturnValue(
        readyResult({
          messages: [
            message("m-old", { time: minutesAgo(20), createdAt: minutesAgo(20) }),
            message("m-new", { time: minutesAgo(5), createdAt: minutesAgo(5) }),
            message("m-normal", { priorityId: PriorityStatus.Normal }),
          ],
        }),
      );
      renderDashboard();

      expect(screen.getByText("stack selected: m-new")).toBeInTheDocument();
      expect(screen.getByText("sheet of m-new")).toBeInTheDocument();
    });

    it("does not auto-select a key message older than 30 minutes", () => {
      api.useIncidentMessages.mockReturnValue(
        readyResult({
          messages: [message("m-old", { time: minutesAgo(120), createdAt: minutesAgo(120) })],
        }),
      );
      renderDashboard();

      expect(screen.getByText("stack selected: none")).toBeInTheDocument();
      expect(screen.queryByText(/^sheet of/)).not.toBeInTheDocument();
    });

    it("does not auto-select untriaged or normal priority messages", () => {
      api.useIncidentMessages.mockReturnValue(
        readyResult({
          messages: [
            message("m-pending", { triageId: TriageStatus.Pending }),
            message("m-normal", { priorityId: PriorityStatus.Normal }),
          ],
        }),
      );
      renderDashboard();

      expect(screen.getByText("stack selected: none")).toBeInTheDocument();
    });

    it("keeps an explicit selection and an explicit deselection", () => {
      api.useIncidentMessages.mockReturnValue(
        readyResult({
          messages: [message("m-new"), message("m-normal", { priorityId: PriorityStatus.Normal })],
        }),
      );
      renderDashboard();

      fireEvent.click(screen.getByText("pick m-normal"));
      expect(screen.getByText("stack selected: m-normal")).toBeInTheDocument();
      expect(screen.getByText("sheet of m-normal")).toBeInTheDocument();

      fireEvent.click(screen.getByText("pick nothing"));
      expect(screen.getByText("stack selected: none")).toBeInTheDocument();
      expect(screen.queryByText(/^sheet of/)).not.toBeInTheDocument();
    });

    it("falls back to the newest key message when a newer one arrives after a selection", () => {
      api.useIncidentMessages.mockReturnValue(
        readyResult({ messages: [message("m-first", { time: minutesAgo(10) })] }),
      );
      const { rerender } = renderDashboard();
      fireEvent.click(screen.getByText("pick nothing"));
      expect(screen.getByText("stack selected: none")).toBeInTheDocument();

      api.useIncidentMessages.mockReturnValue(
        readyResult({
          messages: [message("m-first", { time: minutesAgo(10) }), message("m-second")],
        }),
      );
      rerender(
        <IncidentContext.Provider
          value={{
            state: {
              incident: { id: "i1", createdAt: minutesAgo(600) },
              loadedForId: "i1",
            } as IncidentContextState,
            dispatch: () => null,
          }}
        >
          <MemoryRouter initialEntries={["/incident/i1/dashboard"]}>
            <Routes>
              <Route path="/incident/:incidentId/dashboard" element={<Dashboard />} />
            </Routes>
          </MemoryRouter>
        </IncidentContext.Provider>,
      );

      expect(screen.getByText("stack selected: m-second")).toBeInTheDocument();
    });
  });

  describe("selected map feature", () => {
    beforeEach(() => {
      api.useIncidentMessages.mockImplementation((id: string) =>
        readyResult({
          messages:
            id === "child"
              ? [message("c-1", { time: minutesAgo(3) })]
              : [message("m-new"), message("m-normal", { priorityId: PriorityStatus.Normal })],
        }),
      );
    });

    it("focuses the stack on the messages of the feature and shows the newest of them", () => {
      featureIds.value = ["m-normal"];
      renderDashboard();

      fireEvent.click(screen.getByText("select own feature"));

      expect(screen.getByText("stack focus: m-normal")).toBeInTheDocument();
      expect(screen.getByText("stack selected: m-normal")).toBeInTheDocument();
    });

    it("lets a message of the focused feature be picked in the stack", () => {
      featureIds.value = ["m-new", "m-normal"];
      renderDashboard();

      fireEvent.click(screen.getByText("select own feature"));
      fireEvent.click(screen.getByText("pick m-normal"));
      expect(screen.getByText("stack selected: m-normal")).toBeInTheDocument();

      fireEvent.click(screen.getByText("pick nothing"));
      expect(screen.getByText("stack selected: m-new")).toBeInTheDocument();
    });

    it("reads the messages of a feature from the child incident that drew it", () => {
      featureIds.value = ["c-1"];
      renderDashboard();

      fireEvent.click(screen.getByText("select child feature"));

      expect(screen.getByText("stack: c-1")).toBeInTheDocument();
      expect(screen.getByText("stack selected: c-1")).toBeInTheDocument();
      expect(api.useIncidentMessages).toHaveBeenCalledWith("child", { skip: false });
    });

    it("only reads the child incident's messages once a child feature is selected", () => {
      renderDashboard();

      expect(api.useIncidentMessages).toHaveBeenCalledWith("", { skip: true });
    });

    it("keeps the own stack while the messages of a child feature are not loaded", () => {
      featureIds.value = ["c-1"];
      api.useIncidentMessages.mockImplementation((id: string) =>
        id === "child" ? loadingResult() : readyResult({ messages: [message("m-new")] }),
      );
      renderDashboard();

      fireEvent.click(screen.getByText("select child feature"));

      expect(screen.getByText("stack: empty")).toBeInTheDocument();
    });

    it("clears the focus and tells the map to deselect", () => {
      featureIds.value = ["m-normal"];
      renderDashboard();
      fireEvent.click(screen.getByText("select own feature"));
      expect(screen.getByText("deselect token 0")).toBeInTheDocument();

      fireEvent.click(screen.getByText("clear focus"));

      expect(screen.getByText("deselect token 1")).toBeInTheDocument();
    });

    it("drops the focus when the map deselects the feature", () => {
      featureIds.value = undefined;
      renderDashboard();
      fireEvent.click(screen.getByText("select own feature"));
      fireEvent.click(screen.getByText("deselect feature"));

      expect(api.useFeatureChangeTimes).toHaveBeenCalled();
      expect(screen.getByText("stack focus: none")).toBeInTheDocument();
    });
  });

  describe("timeline", () => {
    it("starts at the earliest of the incident, its messages and the map changes", () => {
      const created = new Date("2024-05-01T08:00:00Z");
      const early = new Date("2024-05-01T06:00:00Z");
      const feature = new Date("2024-05-01T07:00:00Z");
      api.useIncidentMessages.mockReturnValue(
        readyResult({ messages: [message("m1", { time: early, createdAt: early })] }),
      );
      api.useFeatureChangeTimes.mockReturnValue([feature.getTime()]);
      renderDashboard({ createdAt: created });

      expect(screen.getByText(`slider start ${early.toISOString()}`)).toBeInTheDocument();
    });

    it("starts at the incident creation when nothing is earlier", () => {
      const created = new Date("2024-05-01T08:00:00Z");
      renderDashboard({ createdAt: created });

      expect(screen.getByText(`slider start ${created.toISOString()}`)).toBeInTheDocument();
    });

    it("ticks at key message times and map changes", () => {
      const keyTime = new Date("2024-05-01T09:00:00Z");
      api.useIncidentMessages.mockReturnValue(
        readyResult({
          messages: [
            message("m-key", { time: keyTime }),
            message("m-normal", { priorityId: PriorityStatus.Normal }),
          ],
        }),
      );
      api.useFeatureChangeTimes.mockReturnValue([12345]);
      renderDashboard();

      expect(screen.getByText(`ticks ${keyTime.getTime()},12345`)).toBeInTheDocument();
      expect(api.useFeatureChangeTimes).toHaveBeenCalledWith("i1", { pollInterval: 10_000 });
    });

    it("shows the past: asks for the resources at that time and hides later messages", () => {
      api.useIncidentMessages.mockReturnValue(
        readyResult({
          messages: [
            message("m-before", { time: new Date("2024-05-01T09:00:00Z") }),
            message("m-after", { time: new Date("2024-05-01T11:00:00Z") }),
          ],
        }),
      );
      renderDashboard();
      expect(screen.getByText("stack: m-before,m-after")).toBeInTheDocument();

      fireEvent.click(screen.getByText("go to the past"));

      expect(screen.getByText("stack: m-before")).toBeInTheDocument();
      expect(screen.getByText("map asOf=2024-05-01T10:00:00.000Z")).toBeInTheDocument();
      expect(api.useIncidentResources).toHaveBeenLastCalledWith(
        "i1",
        new Date("2024-05-01T10:00:00Z"),
      );
    });
  });
});
