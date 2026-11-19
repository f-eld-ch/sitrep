import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "api/errors";
import { readyResult } from "api/testing/results";
import type { IncidentResourcesData, MessageForTriageData, Resource } from "api";
import { PriorityStatus, TriageStatus } from "types";
import {
  Providers,
  home,
  lookup,
  message,
  resource,
  schadenplatz,
  testLanguage,
} from "./triageTestKit";
import TriageView from "./TriageView";

const commandNames = [
  "alertResource",
  "markReady",
  "deploy",
  "standDown",
  "relieve",
  "handOver",
  "reassign",
  "updateLocation",
  "updateContact",
  "changeHauptaufgabe",
] as const;

const h = vi.hoisted(() => ({
  messages: undefined as unknown,
  resources: undefined as unknown,
  forTriage: undefined as unknown,
  triage: vi.fn(),
  reactivate: vi.fn(),
  icons: false,
  // one entry per command hook of the resource panel, filled in beforeEach
  cmd: {} as Record<string, ReturnType<typeof vi.fn>>,
  cmdState: { loading: false, error: undefined as unknown },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: lookup,
    i18n: { language: testLanguage.current, resolvedLanguage: testLanguage.current },
  }),
}));
vi.mock("@openfeature/react-sdk", () => ({ useBooleanFlagValue: () => false }));
vi.mock("components/babs/useBabsIcons", () => ({ useBabsIcons: () => h.icons }));
vi.mock("@f-eld-ch/babs-react", () => ({
  BabsIcon: ({ icon }: { icon: string }) => <span data-testid="babs-icon" data-icon={icon} />,
  BabsIconProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("api", async () => ({
  ...(await import("api/errors")),
  useIncidentMessages: () => h.messages,
  useIncidentResources: () => h.resources,
  useMessageForTriage: () => h.forTriage,
  useTriageMessage: () => [h.triage, { loading: false, error: undefined }],
  useRecordCasualties: () => [vi.fn(), { loading: false, error: undefined }],
  useReactivateResource: () => [h.reactivate, { loading: false, error: undefined }],
  useAlertResource: () => [h.cmd.alertResource, h.cmdState],
  useMarkResourceReady: () => [h.cmd.markReady, h.cmdState],
  useDeployResource: () => [h.cmd.deploy, h.cmdState],
  useHandOver: () => [h.cmd.handOver, h.cmdState],
  useStandDownResource: () => [h.cmd.standDown, h.cmdState],
  useRelieveResource: () => [h.cmd.relieve, h.cmdState],
  useReassignResource: () => [h.cmd.reassign, h.cmdState],
  useUpdateDeploymentLocation: () => [h.cmd.updateLocation, h.cmdState],
  useUpdateContact: () => [h.cmd.updateContact, h.cmdState],
  useChangeHauptaufgabe: () => [h.cmd.changeHauptaufgabe, h.cmdState],
}));
vi.mock("./Message", () => ({
  default: () => null,
  PrintSheetAction: () => null,
}));
vi.mock("./FilterableMessageStack", () => ({ FilterableMessageStack: () => null }));
vi.mock("./Editor", () => ({ MessageEditorForm: () => null }));
vi.mock("./ResourceDetailsForm", () => ({ ResourceDetailsForm: () => null }));
vi.mock("../measures/tasks", () => ({ NewForm: () => null }));

const msg = message("m1");
h.messages = readyResult({ messages: [msg] });

const defaultSp = (resources: Resource[] = []) =>
  schadenplatz("sp-default", { isDefault: true, name: "default", resources });

function setResources(resources: Resource[], extra: Partial<IncidentResourcesData> = {}) {
  h.resources = readyResult({
    incidentId: "inc-1",
    incidentName: "Hochwasser",
    schadenplaetze: [defaultSp(resources.filter((r) => r.status !== "ABGELOEST"))],
    childIncidents: [],
    resources,
    ...extra,
  } as IncidentResourcesData);
}

function setLinked(linkedResourceIds: string[]) {
  h.forTriage = readyResult({
    message: msg,
    incidentDivisions: [],
    linkedResourceIds,
    schadenplatzCasualties: [],
  } as MessageForTriageData);
}

function openMittel() {
  render(
    <Providers>
      <TriageView />
    </Providers>,
  );
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "steps" })).getByRole("button", {
      name: /Mittel$/,
    }),
  );
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: "Triage abschliessen" }));
const lastTriage = () => h.triage.mock.calls.at(-1)?.[0];
const rowOf = (text: string) => screen.getByText(text).closest("button") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  testLanguage.current = "de";
  h.icons = false;
  h.triage.mockReset().mockResolvedValue(undefined);
  h.reactivate.mockReset().mockResolvedValue(undefined);
  h.cmdState.loading = false;
  h.cmdState.error = undefined;
  for (const name of commandNames) h.cmd[name] = vi.fn().mockResolvedValue(undefined);
  h.cmd.alertResource.mockResolvedValue({ resourceId: "r-real" });
  setResources([]);
  setLinked([]);
});

describe("TriageView resource picker", () => {
  it("says so when the incident has no resources", () => {
    openMittel();

    expect(screen.getByText("Keine Mittel erfasst")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Neues Mittel aufbieten" })).toBeInTheDocument();
  });

  it("lists the resources that were available at the message time", () => {
    setResources([
      resource("r1", { name: "Gruppe 1" }),
      resource("r-late", { name: "Zu spät", statusAt: "2026-01-15T11:00:00Z" }),
      resource("r-out", {
        name: "Abgelöst",
        status: "ABGELOEST",
        relievedAt: "2026-01-15T09:00:00Z",
      }),
    ]);
    openMittel();

    expect(screen.getByText("Gruppe 1")).toBeInTheDocument();
    expect(screen.getByText("Feuerwehr Altdorf")).toBeInTheDocument();
    expect(screen.queryByText("Zu spät")).not.toBeInTheDocument();
  });

  it("selects a resource for the message and submits its id", async () => {
    setResources([resource("r1", { name: "Gruppe 1" })]);
    openMittel();

    fireEvent.click(rowOf("Gruppe 1"));
    // it moved from the list of available resources to the selected ones
    expect(screen.queryByRole("button", { name: /Gruppe 1/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "bearbeiten" })).toBeInTheDocument();
    submit();

    await waitFor(() => expect(h.triage).toHaveBeenCalled());
    expect(lastTriage()).toEqual({
      incidentId: "inc-1",
      messageId: "m1",
      priority: PriorityStatus.Normal,
      triage: TriageStatus.Triaged,
      divisionIds: [],
      divisions: [],
      linkedResourceIds: ["r1"],
    });
  });

  it("deselects a selected resource again", async () => {
    setResources([resource("r1", { name: "Gruppe 1" })]);
    setLinked(["r1"]);
    openMittel();
    expect(screen.getByRole("button", { name: "bearbeiten" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "schliessen" }));

    expect(screen.getByRole("button", { name: /Gruppe 1/ })).toBeInTheDocument();
    submit();
    await waitFor(() => expect(h.triage).toHaveBeenCalled());
    expect(lastTriage().linkedResourceIds).toEqual([]);
  });

  it("starts with the resources that are already linked to the message", async () => {
    setResources([resource("r1"), resource("r2")]);
    setLinked(["r2"]);
    openMittel();

    submit();

    await waitFor(() => expect(h.triage).toHaveBeenCalled());
    expect(lastTriage().linkedResourceIds).toEqual(["r2"]);
  });

  it("keeps a relieved resource visible once it is linked to the message", () => {
    setResources([
      resource("r1", { name: "Gruppe 1", status: "ABGELOEST", relievedAt: "2026-01-15T09:00:00Z" }),
    ]);
    setLinked(["r1"]);
    openMittel();

    expect(screen.getByText("Gruppe 1")).toBeInTheDocument();
    expect(screen.getByText("Abgelöst")).toBeInTheDocument();
  });

  describe("search and paging", () => {
    const many = () =>
      Array.from({ length: 7 }, (_, i) =>
        resource(`r${i + 1}`, { name: `Gruppe ${i + 1}`, homeLocation: home(`Ort${i + 1}`) }),
      );

    it("shows five resources and the rest on demand", () => {
      setResources(many());
      openMittel();

      expect(screen.getAllByRole("button", { name: /Gruppe \d/ })).toHaveLength(5);
      fireEvent.click(screen.getByRole("button", { name: /weitere anzeigen/ }));

      expect(screen.getAllByRole("button", { name: /Gruppe \d/ })).toHaveLength(7);
      expect(screen.queryByRole("button", { name: /weitere anzeigen/ })).not.toBeInTheDocument();
    });

    it.each([
      ["the unit name", "gruppe 6"],
      ["the home location", "ort6"],
      ["the formation", "feuerwehr ort6"],
    ])("finds a resource by %s", (_label, query) => {
      setResources(many());
      openMittel();

      fireEvent.change(screen.getByPlaceholderText("Mittel suchen…"), { target: { value: query } });

      expect(screen.getAllByRole("button", { name: /Gruppe \d/ })).toHaveLength(1);
      expect(screen.getByText("Gruppe 6")).toBeInTheDocument();
    });

    it("finds a resource by its task and says so when nothing matches", () => {
      setResources([resource("r1", { name: "Gruppe 1", hauptaufgabe: "Pumpen" })]);
      openMittel();
      const search = screen.getByPlaceholderText("Mittel suchen…");

      fireEvent.change(search, { target: { value: "pump" } });
      expect(screen.getByText("Gruppe 1")).toBeInTheDocument();

      fireEvent.change(search, { target: { value: "xyz" } });
      expect(screen.getByText("Keine Mittel gefunden")).toBeInTheDocument();
    });

    it("clears the search after a resource was picked", () => {
      setResources(many());
      openMittel();
      const search = screen.getByPlaceholderText("Mittel suchen…");
      fireEvent.change(search, { target: { value: "gruppe 6" } });

      fireEvent.click(rowOf("Gruppe 6"));

      expect(search).toHaveValue("");
    });
  });

  describe("relieved resources", () => {
    const relieved = () =>
      resource("r-old", {
        name: "Gruppe alt",
        status: "ABGELOEST",
        relievedAt: "2026-01-15T09:00:00Z",
      });

    it("offers a relieved resource for reactivation at the message time", async () => {
      setResources([relieved()]);
      openMittel();
      const toggle = screen.getByRole("button", { name: /Abgelöst \(1\)/ });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Gruppe alt")).not.toBeInTheDocument();

      fireEvent.click(toggle);
      fireEvent.click(rowOf("Gruppe alt"));

      expect(h.reactivate).toHaveBeenCalledWith({ id: "r-old", at: msg.time });
      // selected right away
      submit();
      await waitFor(() => expect(h.triage).toHaveBeenCalled());
      expect(lastTriage().linkedResourceIds).toEqual(["r-old"]);
    });

    it("drops the selection again when the reactivation fails", async () => {
      h.reactivate.mockRejectedValue(new ApiError("FORBIDDEN"));
      setResources([relieved()]);
      openMittel();

      fireEvent.click(screen.getByRole("button", { name: /Abgelöst \(1\)/ }));
      fireEvent.click(rowOf("Gruppe alt"));
      await waitFor(() => expect(h.reactivate).toHaveBeenCalled());

      await waitFor(() => expect(screen.queryByRole("button", { name: "bearbeiten" })).toBeNull());
      submit();
      await waitFor(() => expect(h.triage).toHaveBeenCalled());
      expect(lastTriage().linkedResourceIds).toEqual([]);
    });

    it("leaves out resources that were relieved after the message", () => {
      setResources([{ ...relieved(), relievedAt: "2026-01-15T12:00:00Z" }]);
      openMittel();

      expect(screen.queryByRole("button", { name: /Abgelöst \(/ })).not.toBeInTheDocument();
    });

    it("expands the section by itself while searching", () => {
      setResources([relieved()]);
      openMittel();

      fireEvent.change(screen.getByPlaceholderText("Mittel suchen…"), {
        target: { value: "alt" },
      });

      expect(screen.getByText("Gruppe alt")).toBeInTheDocument();
      expect(screen.getByText("Reaktivieren")).toBeInTheDocument();
    });
  });

  it("shows the BABS icons once they are loaded", () => {
    h.icons = true;
    setResources([resource("r1")]);
    openMittel();

    expect(screen.getByTestId("babs-icon")).toHaveAttribute("data-icon", "4202");
  });
});

describe("TriageView new resource form", () => {
  const open = () =>
    fireEvent.click(screen.getByRole("button", { name: "+ Neues Mittel aufbieten" }));
  const fill = (values: { place?: string; name?: string; count?: string }) => {
    if (values.place !== undefined)
      fireEvent.change(screen.getByLabelText("Formations- oder Ortsbezeichnung"), {
        target: { value: values.place },
      });
    if (values.name !== undefined)
      fireEvent.change(screen.getByLabelText("Name des Mittels"), {
        target: { value: values.name },
      });
    if (values.count !== undefined)
      fireEvent.change(screen.getByLabelText("Personen"), { target: { value: values.count } });
  };
  const add = () => screen.getByRole("button", { name: "Mittel aufbieten" });
  const pickFormation = () => fireEvent.click(screen.getByTitle("Feuerwehr"));

  it("hides the resource list while the form is open and closes it again", () => {
    setResources([resource("r1", { name: "Gruppe 1" })]);
    openMittel();
    open();

    expect(screen.queryByPlaceholderText("Mittel suchen…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close resource form" }));

    expect(screen.getByPlaceholderText("Mittel suchen…")).toBeInTheDocument();
  });

  it("can only be submitted when formation, name, place and headcount are given", () => {
    openMittel();
    open();
    expect(add()).toBeDisabled();

    pickFormation();
    fill({ place: "Erstfeld", name: "Gruppe 9" });
    expect(add()).toBeDisabled();

    fill({ count: "0" });
    expect(add()).toBeDisabled();

    fill({ count: "8" });
    expect(add()).toBeEnabled();
    expect(screen.getByText("Gruppe · 8 Personen")).toBeInTheDocument();
  });

  it.each([
    ["3", "TRUPP"],
    ["12", "GRUPPE"],
    ["40", "ZUG"],
    ["100", "KOMPANIE"],
    ["400", "BATAILLON"],
  ])("derives the size of a unit of %s people", async (count, size) => {
    openMittel();
    open();
    pickFormation();
    fill({ place: "Erstfeld", name: "Gruppe 9", count });

    fireEvent.click(add());

    await waitFor(() => expect(h.cmd.alertResource).toHaveBeenCalled());
    expect(h.cmd.alertResource).toHaveBeenCalledWith(
      expect.objectContaining({ size, personnelCount: Number(count) }),
    );
  });

  it("alerts the resource on the default Schadenplatz and selects it", async () => {
    openMittel();
    open();
    pickFormation();
    fill({ place: " Erstfeld ", name: " Gruppe 9 ", count: "8" });

    fireEvent.click(add());

    await waitFor(() => expect(h.cmd.alertResource).toHaveBeenCalledTimes(1));
    expect(h.cmd.alertResource).toHaveBeenCalledWith({
      incidentId: "inc-1",
      schadenplatzId: "sp-default",
      formation: "FW",
      name: "Gruppe 9",
      size: "GRUPPE",
      personnelCount: 8,
      hauptaufgabe: "",
      homeLocation: { name: "Erstfeld" },
      sourceMessageId: "m1",
      occurredAt: msg.time,
      tempId: expect.stringMatching(/^temp-alert-/),
    });
    // the form closed and went back to its link
    expect(screen.getByRole("button", { name: "+ Neues Mittel aufbieten" })).toBeInTheDocument();

    // the placeholder id is replaced by the real one once the server answered
    submit();
    await waitFor(() => expect(h.triage).toHaveBeenCalled());
    expect(lastTriage().linkedResourceIds).toEqual(["r-real"]);
  });

  it("forgets the new resource when alerting it fails", async () => {
    h.cmd.alertResource.mockRejectedValue(new ApiError("FORBIDDEN"));
    openMittel();
    open();
    pickFormation();
    fill({ place: "Erstfeld", name: "Gruppe 9", count: "8" });

    fireEvent.click(add());
    await waitFor(() => expect(h.cmd.alertResource).toHaveBeenCalled());
    await Promise.resolve();

    submit();
    await waitFor(() => expect(h.triage).toHaveBeenCalled());
    expect(lastTriage().linkedResourceIds).toEqual([]);
  });

  it("keeps the optimistic id when the server keeps it", async () => {
    h.cmd.alertResource.mockImplementation(async (args: { tempId: string }) => ({
      resourceId: args.tempId,
    }));
    openMittel();
    open();
    pickFormation();
    fill({ place: "Erstfeld", name: "Gruppe 9", count: "8" });

    fireEvent.click(add());
    await waitFor(() => expect(h.cmd.alertResource).toHaveBeenCalled());
    submit();

    await waitFor(() => expect(h.triage).toHaveBeenCalled());
    expect(lastTriage().linkedResourceIds).toEqual([expect.stringMatching(/^temp-alert-/)]);
  });

  it("refuses a unit that is already in service", () => {
    setResources([resource("r1", { name: "Gruppe 9", homeLocation: home("Erstfeld") })]);
    openMittel();
    open();
    pickFormation();

    fill({ place: "erstfeld", name: "GRUPPE 9", count: "8" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ein aktives Mittel mit derselben Formationsbezeichnung, Formation und Name existiert bereits.",
    );
    expect(screen.getByLabelText("Name des Mittels")).toHaveAttribute("aria-invalid", "true");
    expect(add()).toBeDisabled();
  });

  it("offers to reactivate a relieved unit instead of creating it twice", async () => {
    setResources([
      resource("r-old", {
        name: "Gruppe 9",
        homeLocation: home("Erstfeld"),
        status: "ABGELOEST",
        relievedAt: "2026-01-15T09:00:00Z",
      }),
    ]);
    openMittel();
    open();
    pickFormation();
    fill({ place: "Erstfeld", name: "Gruppe 9", count: "8" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Diese Einheit ist abgelöst – bitte reaktivieren statt neu erfassen.",
    );
    expect(add()).toBeDisabled();
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", { name: "Reaktivieren" }),
    );

    expect(h.reactivate).toHaveBeenCalledWith({ id: "r-old", at: msg.time });
    expect(h.cmd.alertResource).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "+ Neues Mittel aufbieten" })).toBeInTheDocument();
    submit();
    await waitFor(() => expect(h.triage).toHaveBeenCalled());
    expect(lastTriage().linkedResourceIds).toEqual(["r-old"]);
  });

  it("shows the alert error and the busy label from the command", () => {
    h.cmdState.error = new ApiError("FORBIDDEN");
    h.cmdState.loading = true;
    openMittel();
    open();
    pickFormation();
    fill({ place: "Erstfeld", name: "Gruppe 9", count: "8" });

    expect(screen.getByText("Sie haben keine Berechtigung für diese Aktion.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wird aufgeboten…" })).toBeDisabled();
  });

  it("previews the icon of the formation once the catalogue is loaded", () => {
    h.icons = true;
    openMittel();
    open();

    pickFormation();
    expect(screen.getAllByTestId("babs-icon").map((e) => e.getAttribute("data-icon"))).toContain(
      "4702",
    );

    fill({ count: "8" });
    // formation and size together give the combined icon
    expect(screen.getAllByTestId("babs-icon").map((e) => e.getAttribute("data-icon"))).toContain(
      "4202",
    );
  });
});

describe("TriageView resource edit panel", () => {
  const edit = () => fireEvent.click(screen.getByRole("button", { name: "bearbeiten" }));
  const select = (r: Resource, others: Resource[] = []) => {
    setResources([r, ...others]);
    setLinked([r.id]);
    openMittel();
    edit();
  };

  describe("alerted unit", () => {
    const alerted = () => resource("r1", { status: "AUFGEBOTEN" });

    it("marks the unit ready at the message time and closes the panel", async () => {
      select(alerted());

      fireEvent.click(screen.getByRole("button", { name: "Einsatzbereit melden" }));

      expect(h.cmd.markReady).toHaveBeenCalledWith({ id: "r1", at: msg.time });
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Einsatzbereit melden" })).toBeNull(),
      );
    });

    it("stores the contact when the field is left", () => {
      select(alerted());
      const detail = screen.getByPlaceholderText("Kontakt");

      fireEvent.change(screen.getByDisplayValue("Telefon"), { target: { value: "RADIO" } });
      fireEvent.change(detail, { target: { value: "  079 123  " } });
      fireEvent.blur(detail);

      expect(h.cmd.updateContact).toHaveBeenCalledWith({
        id: "r1",
        medium: "RADIO",
        detail: "079 123",
        at: msg.time,
      });
    });

    it("does not store an empty contact", () => {
      select(alerted());
      const detail = screen.getByPlaceholderText("Kontakt");

      fireEvent.change(detail, { target: { value: "  " } });
      fireEvent.blur(detail);

      expect(h.cmd.updateContact).not.toHaveBeenCalled();
    });

    it("shows a failed action and blocks the button while busy", () => {
      h.cmdState.error = new ApiError("CONFLICT");
      h.cmdState.loading = true;
      select(alerted());

      expect(
        screen.getByText("Die Anfrage kann aufgrund eines Konflikts nicht ausgeführt werden."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Einsatzbereit melden" })).toBeDisabled();
    });
  });

  describe("ready unit", () => {
    const ready = () => resource("r1", { status: "EINSATZBEREIT" });
    const task = () => screen.getByLabelText(/Hauptaufgabe/);
    const place = () => screen.getByLabelText(/Einsatzort/);
    const deploy = () => fireEvent.click(screen.getByRole("button", { name: "Einsetzen" }));

    it("requires a task and a location before deploying", () => {
      select(ready());

      deploy();

      expect(screen.getByText("Hauptaufgabe ist erforderlich für den Einsatz")).toBeInTheDocument();
      expect(screen.getByText("Einsatzort ist erforderlich für den Einsatz")).toBeInTheDocument();
      expect(h.cmd.deploy).not.toHaveBeenCalled();

      // editing a field removes the hint again
      fireEvent.change(task(), { target: { value: "Pumpen" } });
      expect(screen.queryByText("Hauptaufgabe ist erforderlich für den Einsatz")).toBeNull();
    });

    it("stores task and location when left, then deploys at the message time", async () => {
      select(ready());

      fireEvent.change(task(), { target: { value: " Pumpen " } });
      fireEvent.blur(task());
      fireEvent.change(place(), { target: { value: " Bahnhof " } });
      fireEvent.blur(place());
      deploy();

      expect(h.cmd.changeHauptaufgabe).toHaveBeenCalledWith({
        id: "r1",
        hauptaufgabe: "Pumpen",
        at: msg.time,
      });
      expect(h.cmd.updateLocation).toHaveBeenCalledWith({
        id: "r1",
        label: "Bahnhof",
        at: msg.time,
      });
      expect(h.cmd.deploy).toHaveBeenCalledWith({ id: "r1", at: msg.time });
      await waitFor(() => expect(screen.queryByRole("button", { name: "Einsetzen" })).toBeNull());
    });

    it("does not store an unchanged task or an empty location", () => {
      select(resource("r1", { hauptaufgabe: "Pumpen" }));

      fireEvent.blur(task());
      fireEvent.change(place(), { target: { value: "" } });
      fireEvent.blur(place());

      expect(h.cmd.changeHauptaufgabe).not.toHaveBeenCalled();
      expect(h.cmd.updateLocation).not.toHaveBeenCalled();
    });

    it("dismisses the unit and keeps it on the message", async () => {
      select(ready());

      fireEvent.click(screen.getByRole("button", { name: "Entlassen" }));

      await waitFor(() =>
        expect(h.cmd.relieve).toHaveBeenCalledWith({ id: "r1", successorId: null, at: msg.time }),
      );
      expect(h.cmd.reassign).not.toHaveBeenCalled();
    });

    it("moves the unit back to the default Schadenplatz when it is dismissed from another one", async () => {
      setResources([resource("r1", { schadenplatzId: "sp-1" })], {
        schadenplaetze: [
          defaultSp(),
          schadenplatz("sp-1", {
            name: "Brücke",
            resources: [resource("r1", { schadenplatzId: "sp-1" })],
          }),
        ],
      });
      setLinked(["r1"]);
      openMittel();
      edit();

      fireEvent.click(screen.getByRole("button", { name: "Entlassen" }));

      await waitFor(() =>
        expect(h.cmd.reassign).toHaveBeenCalledWith({
          id: "r1",
          schadenplatzId: "sp-default",
          at: msg.time,
        }),
      );
    });

    it("reassigns the unit to another Schadenplatz", async () => {
      setResources([resource("r1")], {
        schadenplaetze: [defaultSp([resource("r1")]), schadenplatz("sp-1", { name: "Brücke" })],
      });
      setLinked(["r1"]);
      openMittel();
      edit();

      fireEvent.change(screen.getByLabelText("Schadenplatz wählen"), { target: { value: "sp-1" } });

      await waitFor(() =>
        expect(h.cmd.reassign).toHaveBeenCalledWith({
          id: "r1",
          schadenplatzId: "sp-1",
          at: msg.time,
        }),
      );
    });

    it("does not offer a Schadenplatz choice when there is only one", () => {
      select(ready());

      expect(screen.queryByLabelText("Schadenplatz wählen")).not.toBeInTheDocument();
    });
  });

  describe("deployed unit", () => {
    const deployed = () => resource("r1", { status: "EINGESETZT" });

    it("stands the unit down", async () => {
      select(deployed());

      fireEvent.click(screen.getByRole("button", { name: "Einsatz abgeschlossen" }));

      await waitFor(() => expect(h.cmd.standDown).toHaveBeenCalledWith({ id: "r1", at: msg.time }));
    });

    it("has no successor to choose when there is no other unit", () => {
      select(deployed());

      expect(screen.getByLabelText("Ablösung durch")).toBeDisabled();
      expect(screen.getByText("Keine andere Formation verfügbar")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ablösen" })).toBeDisabled();
    });

    it("hands over to the chosen successor and selects both units", async () => {
      select(deployed(), [resource("r2", { name: "Gruppe 2" })]);
      expect(screen.getByRole("button", { name: "Ablösen" })).toBeDisabled();

      fireEvent.change(screen.getByLabelText("Ablösung durch"), { target: { value: "r2" } });
      fireEvent.click(screen.getByRole("button", { name: "Ablösen" }));

      await waitFor(() =>
        expect(h.cmd.handOver).toHaveBeenCalledWith({
          id: "r1",
          successorId: "r2",
          at: msg.time,
        }),
      );
      // both are on the message afterwards
      await waitFor(() =>
        expect(screen.getAllByRole("button", { name: "bearbeiten" })).toHaveLength(2),
      );
      submit();
      await waitFor(() => expect(h.triage).toHaveBeenCalled());
      expect(lastTriage().linkedResourceIds).toEqual(["r1", "r2"]);
    });

    it("dismisses the unit without a successor", async () => {
      select(deployed());

      fireEvent.click(screen.getByRole("button", { name: "Entlassen" }));

      await waitFor(() =>
        expect(h.cmd.relieve).toHaveBeenCalledWith({ id: "r1", successorId: null, at: msg.time }),
      );
    });
  });

  it("names the successor of a relieved unit", () => {
    const old = resource("r1", {
      status: "ABGELOEST",
      relievedAt: "2026-01-15T09:00:00Z",
      successorId: "r2",
    });
    const successor = resource("r2", {
      name: "",
      size: "ZUG",
      contact: { medium: "PHONE", detail: "079 1" },
    });
    setResources([old, successor], {
      schadenplaetze: [defaultSp([successor, old])],
    });
    setLinked(["r1"]);
    openMittel();

    edit();

    expect(screen.getByText(/Abgelöst durch:/)).toHaveTextContent("Zug · Telefon: 079 1");
    // a relieved unit cannot be changed any more
    expect(screen.queryByRole("button", { name: "Entlassen" })).not.toBeInTheDocument();
  });
});
