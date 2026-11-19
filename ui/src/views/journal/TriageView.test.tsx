import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "api/errors";
import { errorResult, loadingResult, readyResult } from "api/testing/results";
import type { IncidentResourcesData, MessageForTriageData } from "api";
import { PriorityStatus, TriageStatus, type Message } from "types";
import {
  Providers,
  divisionLog,
  divisionSc,
  lookup,
  message,
  noCasualties,
  resource,
  schadenplatz,
  testLanguage,
} from "./triageTestKit";
import TriageView from "./TriageView";

const h = vi.hoisted(() => ({
  messages: undefined as unknown,
  resources: undefined as unknown,
  forTriage: undefined as unknown,
  triage: vi.fn(),
  triageState: { loading: false, error: undefined as unknown },
  recordCasualties: vi.fn(),
  reactivate: vi.fn(),
  editorSave: vi.fn(),
  showTasks: false,
  icons: false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: lookup,
    i18n: { language: testLanguage.current, resolvedLanguage: testLanguage.current },
  }),
}));
vi.mock("@openfeature/react-sdk", () => ({ useBooleanFlagValue: () => h.showTasks }));
vi.mock("components/babs/useBabsIcons", () => ({ useBabsIcons: () => h.icons }));
vi.mock("@f-eld-ch/babs-react", () => ({
  BabsIcon: ({ icon }: { icon: string }) => <span data-testid="babs-icon" data-icon={icon} />,
  BabsIconProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("api", async () => {
  const idle = { loading: false, error: undefined };
  const command = () => [vi.fn().mockResolvedValue(undefined), idle];
  return {
    ...(await import("api/errors")),
    useIncidentMessages: () => h.messages,
    useIncidentResources: () => h.resources,
    useMessageForTriage: () => h.forTriage,
    useTriageMessage: () => [h.triage, h.triageState],
    useRecordCasualties: () => [h.recordCasualties, idle],
    useReactivateResource: () => [h.reactivate, idle],
    useAlertResource: command,
    useMarkResourceReady: command,
    useDeployResource: command,
    useHandOver: command,
    useStandDownResource: command,
    useRelieveResource: command,
    useReassignResource: command,
    useUpdateDeploymentLocation: command,
    useUpdateContact: command,
    useChangeHauptaufgabe: command,
  };
});

vi.mock("./Message", () => ({
  default: ({ message: m }: { message: Message }) => (
    <div data-testid="message-card">
      {`${m.content}|${m.priorityId}|${m.triageId}|${m.divisions.map((d) => d.division.name).join(",")}`}
    </div>
  ),
  PrintSheetAction: () => <button type="button">print-sheet</button>,
}));
vi.mock("./FilterableMessageStack", () => ({
  FilterableMessageStack: ({
    messages,
    effectiveId,
    onSelect,
  }: {
    messages: Message[];
    effectiveId?: string;
    onSelect: (id: string | undefined) => void;
  }) => (
    <div>
      <p data-testid="stack-selected">{effectiveId ?? "none"}</p>
      {messages.map((m) => (
        <button key={m.id} type="button" onClick={() => onSelect(m.id)}>
          {`select ${m.id}`}
        </button>
      ))}
      <button type="button" onClick={() => onSelect(undefined)}>
        select nothing
      </button>
    </div>
  ),
}));
vi.mock("./Editor", () => ({
  MessageEditorForm: forwardRef(function EditorStub(
    { title }: { title: string },
    ref: React.Ref<{ save: () => Promise<void> }>,
  ) {
    useImperativeHandle(ref, () => ({ save: async () => void h.editorSave() }));
    return <p>{`editor: ${title}`}</p>;
  }),
}));
vi.mock("./ResourceDetailsForm", () => ({ ResourceDetailsForm: () => null }));
vi.mock("../measures/tasks", () => ({ NewForm: () => <p>tasks-form</p> }));

const defaultSp = schadenplatz("sp-default", { isDefault: true, name: "default" });

function setResources(overrides: Partial<IncidentResourcesData> = {}) {
  h.resources = readyResult({
    incidentId: "inc-1",
    incidentName: "Hochwasser",
    schadenplaetze: [defaultSp],
    childIncidents: [],
    resources: [],
    ...overrides,
  } as IncidentResourcesData);
}

function setForTriage(overrides: Partial<MessageForTriageData> = {}) {
  h.forTriage = readyResult({
    message: message("m1"),
    incidentDivisions: [],
    linkedResourceIds: [],
    schadenplatzCasualties: [],
    ...overrides,
  } as MessageForTriageData);
}

function setMessages(...messages: Message[]) {
  h.messages = readyResult({ messages });
}

const renderView = (props: Parameters<typeof TriageView>[0] = {}) =>
  render(
    <Providers>
      <TriageView {...props} />
    </Providers>,
  );

const next = () => fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
// The list view has a mobile "back" button of its own (first); the wizard's is the last.
const wizardBackButtons = () =>
  screen.getAllByRole("button", { name: "Zurück" }).filter((b) => b.closest("footer"));
const back = () => fireEvent.click(wizardBackButtons()[0]);
const stepNames = () =>
  within(screen.getByRole("navigation", { name: "steps" }))
    .getAllByRole("button")
    .map((b) => b.textContent);
const card = () => screen.getByTestId("message-card").textContent;
const clickStep = (label: string) =>
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "steps" })).getByRole("button", {
      name: new RegExp(`${label}$`),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  testLanguage.current = "de";
  h.showTasks = false;
  h.icons = false;
  h.triage.mockReset().mockResolvedValue(undefined);
  h.recordCasualties.mockReset().mockResolvedValue(undefined);
  h.reactivate.mockReset().mockResolvedValue(undefined);
  h.triageState.loading = false;
  h.triageState.error = undefined;
  setMessages(message("m1"));
  setResources();
  setForTriage();
});

describe("TriageView list states", () => {
  it("shows a spinner while the messages load", () => {
    h.messages = loadingResult();
    const { container } = renderView();

    expect(container.querySelector('[data-icon="spinner"]')).toBeInTheDocument();
    expect(screen.queryByTestId("message-card")).not.toBeInTheDocument();
  });

  it("shows the translated error when the messages cannot be loaded", () => {
    h.messages = errorResult(new ApiError("FORBIDDEN"));
    renderView();

    expect(screen.getByText("Sie haben keine Berechtigung für diese Aktion.")).toBeInTheDocument();
  });

  it("explains that there is nothing to triage when the incident has no messages", () => {
    setMessages();
    renderView();

    expect(screen.getByText("Noch keine Meldungen erfasst")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Editor/ })).toBeInTheDocument();
  });

  it("shows that everything is triaged when no message is pending", () => {
    setMessages(message("m1", { triageId: TriageStatus.Triaged }));
    renderView();

    expect(screen.getByText("Alles triagiert!")).toBeInTheDocument();
    expect(screen.queryByTestId("message-card")).not.toBeInTheDocument();
  });

  it("refuses to triage in a closed incident", () => {
    render(
      <Providers closed>
        <TriageView />
      </Providers>,
    );

    expect(
      screen.getByText("Dieses Ereignis ist abgeschlossen. Triage ist nicht mehr möglich."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("message-card")).not.toBeInTheDocument();
  });

  it("does not select a message with initialStrategy none, then opens the chosen one", () => {
    renderView({ initialStrategy: "none" });

    expect(screen.queryByTestId("message-card")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "select m1" }));
    expect(card()).toContain("content-m1");
  });

  it.each([
    ["oldest-pending", "m-old"],
    ["newest", "m-new"],
  ] as const)("selects the %s message first", (strategy, expected) => {
    // buildMessageList sorts newest first, so the oldest pending message is the last one.
    setMessages(
      message("m-new", { number: 2, time: new Date("2026-01-15T12:00:00Z") }),
      message("m-old", { number: 1, time: new Date("2026-01-15T09:00:00Z") }),
    );
    renderView({ initialStrategy: strategy });

    expect(screen.getByTestId("stack-selected")).toHaveTextContent(expected);
    expect(card()).toContain(`content-${expected}`);
  });

  it("moves between messages with Ctrl+Arrow and clears the selection with Escape", () => {
    setMessages(
      message("m-new", { number: 2, time: new Date("2026-01-15T12:00:00Z") }),
      message("m-old", { number: 1, time: new Date("2026-01-15T09:00:00Z") }),
    );
    renderView();
    expect(screen.getByTestId("stack-selected")).toHaveTextContent("m-old");

    fireEvent.keyDown(document, { key: "ArrowUp", ctrlKey: true });
    expect(screen.getByTestId("stack-selected")).toHaveTextContent("m-new");

    // already at the top: nothing further up
    fireEvent.keyDown(document, { key: "ArrowUp", ctrlKey: true });
    expect(screen.getByTestId("stack-selected")).toHaveTextContent("m-new");

    fireEvent.keyDown(document, { key: "ArrowDown", ctrlKey: true });
    expect(screen.getByTestId("stack-selected")).toHaveTextContent("m-old");

    // Arrow without Ctrl is ignored
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(screen.getByTestId("stack-selected")).toHaveTextContent("m-old");

    // Escape drops the explicit choice and returns to the automatic one (oldest pending).
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("stack-selected")).toHaveTextContent("m-old");
  });

  it("drops an explicit selection through the mobile back button", () => {
    setMessages(
      message("m-new", { number: 2, time: new Date("2026-01-15T12:00:00Z") }),
      message("m-old", { number: 1, time: new Date("2026-01-15T09:00:00Z") }),
    );
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "select m-new" }));
    expect(screen.getByTestId("stack-selected")).toHaveTextContent("m-new");

    fireEvent.click(screen.getAllByRole("button", { name: "Zurück" })[0]);

    expect(screen.getByTestId("stack-selected")).toHaveTextContent("m-old");
  });
});

describe("TriageView wizard steps", () => {
  it("starts a pending message with the Meldung step and all four steps", () => {
    renderView();

    expect(stepNames()).toEqual(["1Meldung", "2Meldefluss", "3Personen", "4Mittel"]);
    expect(screen.getByText("editor: Meldung überprüfen")).toBeInTheDocument();
    expect(wizardBackButtons()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Triage abschliessen" })).not.toBeInTheDocument();
  });

  it("saves the edited message when leaving the Meldung step and navigates back and forth", () => {
    renderView();

    next();
    expect(h.editorSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Schlüsselnachricht" })).toBeInTheDocument();
    expect(screen.queryByText(/^editor:/)).not.toBeInTheDocument();

    back();
    expect(screen.getByText("editor: Meldung überprüfen")).toBeInTheDocument();
  });

  it("jumps to a step from the stepper", () => {
    renderView();

    clickStep("Mittel");

    expect(screen.getByPlaceholderText("Mittel suchen…")).toBeInTheDocument();
  });

  it("offers the last step as the submit step", () => {
    renderView();
    clickStep("Mittel");

    expect(screen.queryByRole("button", { name: "Weiter" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Triage abschliessen" })).toBeEnabled();
  });

  it("shows the tasks form on the Meldefluss step only when the flag is on", () => {
    h.showTasks = true;
    renderView();
    clickStep("Meldefluss");

    expect(screen.getByText("tasks-form")).toBeInTheDocument();
  });

  it("leaves the tasks form out when the flag is off", () => {
    renderView();
    clickStep("Meldefluss");

    expect(screen.queryByText("tasks-form")).not.toBeInTheDocument();
  });

  it("advances with Ctrl+Enter", () => {
    renderView();

    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });

    expect(screen.getByRole("heading", { name: "Schlüsselnachricht" })).toBeInTheDocument();
  });

  it("ignores a plain Enter", () => {
    renderView();

    fireEvent.keyDown(document, { key: "Enter" });

    expect(screen.getByText("editor: Meldung überprüfen")).toBeInTheDocument();
  });

  it.each([
    ["fr", "2Flux du message"],
    ["it", "2Flusso dei messaggi"],
  ])("labels the steps in %s", (lang, second) => {
    testLanguage.current = lang;
    renderView();

    expect(stepNames()[1]).toBe(second);
  });
});

describe("TriageView Meldefluss step", () => {
  const openFlow = () => clickStep("Meldefluss");
  const switchKey = () => screen.getByRole("switch", { name: "Schlüsselnachricht" });

  it("marks a message as key message and assigns it to every division", () => {
    renderView();
    openFlow();
    expect(switchKey()).toHaveAttribute("aria-checked", "false");

    fireEvent.click(switchKey());

    expect(switchKey()).toHaveAttribute("aria-checked", "true");
    expect(card()).toBe("content-m1|HIGH|DONE|SC,LOG");
  });

  it("restores the earlier assignment when the key message mark is removed again", () => {
    renderView();
    openFlow();
    // assign Stabschef only, then toggle the key message on and off
    fireEvent.click(screen.getAllByRole("button", { name: "" })[0]);
    expect(card()).toBe("content-m1|NORMAL|PENDING|SC");

    fireEvent.click(switchKey());
    fireEvent.click(switchKey());

    expect(switchKey()).toHaveAttribute("aria-checked", "false");
    expect(card()).toBe("content-m1|NORMAL|PENDING|SC");
  });

  it("clears the assignment when a key message without earlier divisions is unmarked", () => {
    renderView();
    openFlow();

    fireEvent.click(switchKey());
    fireEvent.click(switchKey());

    expect(card()).toBe("content-m1|NORMAL|PENDING|");
  });

  it("assigns and removes a single division", () => {
    renderView();
    openFlow();
    const chips = () => screen.getAllByRole("button", { name: "" });

    fireEvent.click(chips()[1]);
    expect(card()).toContain("|LOG");

    fireEvent.click(chips()[1]);
    expect(card()).toBe("content-m1|NORMAL|PENDING|");
  });
});

describe("TriageView Personen step", () => {
  const openPersons = () => clickStep("Personen");

  it("shows the counters of the default Schadenplatz under the incident name", () => {
    renderView();
    openPersons();

    expect(screen.getByRole("heading", { name: "Hochwasser" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Verletzte" })).toHaveValue(0);
    expect(screen.getByText("Personenübersicht")).toBeInTheDocument();
  });

  const count = (label: string) => screen.getByRole("spinbutton", { name: label });
  const plus = (label: string) => screen.getByRole("button", { name: `${label} +1` });
  const minus = (label: string) => screen.getByRole("button", { name: `${label} −1` });
  const reachedMittel = () => screen.findByPlaceholderText("Mittel suchen…");

  it("does not record anything when no casualty was entered", async () => {
    renderView();
    openPersons();

    next();

    await reachedMittel();
    expect(h.recordCasualties).not.toHaveBeenCalled();
  });

  it("records the entered casualties of the default Schadenplatz at the message time", async () => {
    const m = message("m1");
    setMessages(m);
    renderView();
    openPersons();

    fireEvent.click(plus("Verletzte"));
    fireEvent.click(plus("Verletzte"));
    fireEvent.change(count("Tote"), { target: { value: "1" } });
    expect(screen.getByText("Personenübersicht")).toBeInTheDocument();
    next();

    await reachedMittel();
    expect(h.recordCasualties).toHaveBeenCalledTimes(1);
    expect(h.recordCasualties).toHaveBeenCalledWith({
      schadenplatzId: "sp-default",
      messageId: "m1",
      deltas: { ...noCasualties, verletzte: 2, tote: 1 },
      previous: undefined,
      occurredAt: m.time,
    });
  });

  it("does not let a counter go below what the Schadenplatz holds", () => {
    setResources({
      schadenplaetze: [{ ...defaultSp, casualties: { ...noCasualties, verletzte: 1 } }],
    });
    renderView();
    openPersons();

    expect(minus("Verletzte")).toBeEnabled();
    fireEvent.click(minus("Verletzte"));
    expect(count("Verletzte")).toHaveValue(-1);
    expect(minus("Verletzte")).toBeDisabled();

    fireEvent.change(count("Verletzte"), { target: { value: "-7" } });
    expect(count("Verletzte")).toHaveValue(-1);
    // a category without people cannot go below zero at all
    expect(minus("Tote")).toBeDisabled();
  });

  it("starts from the casualties the message recorded before and lets them be cleared", async () => {
    setResources({
      schadenplaetze: [
        { ...defaultSp, casualties: { ...noCasualties, verletzte: 2 } },
        schadenplatz("sp-1", { name: "Brücke", casualties: { ...noCasualties, tote: 1 } }),
      ],
    });
    setForTriage({
      schadenplatzCasualties: [
        { schadenplatzId: "sp-default", ...noCasualties, verletzte: 2 },
        { schadenplatzId: "sp-1", ...noCasualties, tote: 1 },
      ],
    });
    renderView();
    openPersons();

    // the named Schadenplatz of the earlier triage comes first, then the default one
    expect(screen.getAllByRole("heading", { level: 3 }).map((e) => e.textContent)).toEqual([
      "Brücke",
      "Hochwasser",
    ]);
    expect(screen.getAllByRole("spinbutton", { name: "Verletzte" })[1]).toHaveValue(2);
    expect(screen.getAllByRole("spinbutton", { name: "Tote" })[0]).toHaveValue(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Verletzte −1" })[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "Verletzte −1" })[1]);
    next();

    await reachedMittel();
    expect(h.recordCasualties).toHaveBeenCalledTimes(2);
    expect(h.recordCasualties).toHaveBeenNthCalledWith(1, {
      schadenplatzId: "sp-1",
      messageId: "m1",
      deltas: { ...noCasualties, tote: 1 },
      previous: { schadenplatzId: "sp-1", ...noCasualties, tote: 1 },
      occurredAt: new Date("2026-01-15T10:00:00Z"),
    });
    expect(h.recordCasualties).toHaveBeenNthCalledWith(2, {
      schadenplatzId: "sp-default",
      messageId: "m1",
      deltas: noCasualties,
      previous: { schadenplatzId: "sp-default", ...noCasualties, verletzte: 2 },
      occurredAt: new Date("2026-01-15T10:00:00Z"),
    });
  });

  it.each([
    [
      "the ApiError with its detail",
      new ApiError("FORBIDDEN", "not for you"),
      "Sie haben keine Berechtigung für diese Aktion.",
      1,
    ],
    [
      "UNKNOWN for any other error",
      new Error("boom"),
      "Ein unbekannter Fehler ist aufgetreten.",
      0,
    ],
  ])("stays on the step and shows %s", async (_label, error, text, detailCount) => {
    h.recordCasualties.mockRejectedValueOnce(error);
    renderView();
    openPersons();
    fireEvent.click(plus("Verletzte"));

    next();

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryAllByText("not for you")).toHaveLength(detailCount);
    expect(screen.queryByPlaceholderText("Mittel suchen…")).not.toBeInTheDocument();
    expect(count("Verletzte")).toHaveValue(1);

    // trying again succeeds and clears the error
    next();
    await reachedMittel();
    expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(h.recordCasualties).toHaveBeenCalledTimes(2);
  });
});

describe("TriageView submit", () => {
  const goToLastStep = () => clickStep("Mittel");

  it("submits the triage with the exact arguments and shows the confirmation", async () => {
    setMessages(message("m1", { number: 7 }));
    renderView();
    clickStep("Meldefluss");
    fireEvent.click(screen.getByRole("switch", { name: "Schlüsselnachricht" }));
    goToLastStep();

    fireEvent.click(screen.getByRole("button", { name: "Triage abschliessen" }));

    await waitFor(() => expect(h.triage).toHaveBeenCalledTimes(1));
    expect(h.triage).toHaveBeenCalledWith({
      incidentId: "inc-1",
      messageId: "m1",
      priority: PriorityStatus.High,
      triage: TriageStatus.Triaged,
      divisionIds: ["d-sc", "d-log"],
      divisions: [divisionSc, divisionLog],
      linkedResourceIds: [],
    });
    expect(await screen.findByText("Triage gespeichert")).toBeInTheDocument();
    expect(screen.getByText("Alles triagiert!")).toBeInTheDocument();
  });

  it("saves as 'needs more information' with normal priority from the Meldung step", async () => {
    setMessages(message("m1", { priorityId: PriorityStatus.High }));
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Benötigt mehr Informationen" }));

    await waitFor(() => expect(h.triage).toHaveBeenCalledTimes(1));
    expect(h.triage).toHaveBeenCalledWith({
      incidentId: "inc-1",
      messageId: "m1",
      priority: PriorityStatus.Normal,
      triage: TriageStatus.MoreInfo,
      divisionIds: [],
      divisions: [],
      linkedResourceIds: [],
    });
    expect(await screen.findByText("Triage gespeichert")).toBeInTheDocument();
  });

  it("only offers 'needs more information' on the Meldung step", () => {
    renderView();
    goToLastStep();

    expect(
      screen.queryByRole("button", { name: "Benötigt mehr Informationen" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["an ApiError", new ApiError("CONFLICT", "server says no")],
    ["another error", new Error("boom")],
  ])(
    "keeps the wizard open and shows the command error when the triage rejects with %s",
    async (_label, rejection) => {
      h.triage.mockRejectedValue(rejection);
      // useTriageMessage exposes the failure in its state; the wizard shows that one
      h.triageState.error = new ApiError("CONFLICT", "server says no");
      renderView();
      goToLastStep();

      fireEvent.click(screen.getByRole("button", { name: "Triage abschliessen" }));

      await waitFor(() => expect(h.triage).toHaveBeenCalled());
      expect(screen.queryByText("Triage gespeichert")).not.toBeInTheDocument();
      expect(
        screen.getByText("Die Anfrage kann aufgrund eines Konflikts nicht ausgeführt werden."),
      ).toBeInTheDocument();
      expect(screen.getByText("server says no")).toBeInTheDocument();
    },
  );

  it("disables the submit button while the triage is saved", () => {
    h.triageState.loading = true;
    renderView();
    goToLastStep();

    expect(screen.getByRole("button", { name: "Triage abschliessen" })).toBeDisabled();
  });

  it("disables 'needs more information' while the triage is saved", () => {
    h.triageState.loading = true;
    renderView();

    expect(screen.getByRole("button", { name: "Benötigt mehr Informationen" })).toBeDisabled();
  });

  it("submits with Ctrl+Enter on the last step", async () => {
    renderView();
    goToLastStep();

    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(h.triage).toHaveBeenCalledTimes(1));
  });
});

describe("TriageView saved confirmation", () => {
  async function saveFirst() {
    fireEvent.click(await screen.findByRole("button", { name: "Benötigt mehr Informationen" }));
    await screen.findByText("Triage gespeichert");
  }

  it("offers the next pending message and opens it", async () => {
    setMessages(
      message("m-new", { number: 2, time: new Date("2026-01-15T12:00:00Z") }),
      message("m-old", { number: 1, time: new Date("2026-01-15T09:00:00Z") }),
    );
    renderView();
    await saveFirst();

    fireEvent.click(
      screen.getByRole("button", { name: "Nächste offene Meldung (Nr. {{number}})" }),
    );

    expect(await screen.findByText("editor: Meldung überprüfen")).toBeInTheDocument();
    expect(screen.getByTestId("stack-selected")).toHaveTextContent("m-new");
  });

  it("goes back to the message to adjust it", async () => {
    renderView();
    await saveFirst();

    fireEvent.click(screen.getByRole("button", { name: "Triage anpassen" }));

    expect(await screen.findByText("editor: Meldung überprüfen")).toBeInTheDocument();
  });
});

describe("TriageView triaged message", () => {
  const triaged = () =>
    message("m1", {
      triageId: TriageStatus.Triaged,
      priorityId: PriorityStatus.Normal,
      divisions: [{ division: divisionSc }],
    });

  beforeEach(() => {
    setMessages(triaged());
  });

  it("starts with a summary and enters the wizard without the Meldung step", () => {
    renderView({ initialStrategy: "newest" });

    expect(screen.getByRole("heading", { name: "Meldefluss" })).toBeInTheDocument();
    expect(screen.getByText("Stabschef")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Triage anpassen" }));

    expect(stepNames()).toEqual(["1Meldefluss", "2Personen", "3Mittel"]);
  });

  it("does not call the API when nothing was changed", async () => {
    renderView({ initialStrategy: "newest" });
    fireEvent.click(screen.getByRole("button", { name: "Triage anpassen" }));
    clickStep("Mittel");

    fireEvent.click(screen.getByRole("button", { name: "Triage abschliessen" }));

    expect(await screen.findByText("Triage gespeichert")).toBeInTheDocument();
    expect(h.triage).not.toHaveBeenCalled();
  });

  it("submits a changed priority", async () => {
    renderView({ initialStrategy: "newest" });
    fireEvent.click(screen.getByRole("button", { name: "Triage anpassen" }));
    fireEvent.click(screen.getByRole("switch", { name: "Schlüsselnachricht" }));
    clickStep("Mittel");

    fireEvent.click(screen.getByRole("button", { name: "Triage abschliessen" }));

    await waitFor(() => expect(h.triage).toHaveBeenCalledTimes(1));
    expect(h.triage).toHaveBeenCalledWith(
      expect.objectContaining({ priority: PriorityStatus.High, triage: TriageStatus.Triaged }),
    );
  });

  it("summarises recorded casualties and linked resources", () => {
    setResources({
      resources: [resource("r1", { name: "Gruppe 3" })],
      schadenplaetze: [defaultSp, schadenplatz("sp-1", { name: "Brücke" })],
    });
    setForTriage({
      linkedResourceIds: ["r1"],
      schadenplatzCasualties: [
        { schadenplatzId: "sp-default", ...noCasualties, verletzte: 3 },
        { schadenplatzId: "sp-1", ...noCasualties, tote: 1 },
        { schadenplatzId: "sp-unknown", ...noCasualties },
      ],
    });
    renderView({ initialStrategy: "newest" });

    expect(screen.getByRole("heading", { name: "Personen" })).toBeInTheDocument();
    expect(screen.getByText("Ereignis")).toBeInTheDocument();
    expect(screen.getByText("Hochwasser")).toBeInTheDocument();
    expect(screen.getByText("Brücke")).toBeInTheDocument();
    expect(screen.getByText("Verletzte")).toBeInTheDocument();
    expect(screen.getByText("Tote")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mittel" })).toBeInTheDocument();
    expect(screen.getByText("Feuerwehr Altdorf")).toBeInTheDocument();
    expect(screen.getByText("Gruppe 3")).toBeInTheDocument();
  });

  it("shows a dash for a message without flow, casualties and resources", () => {
    setMessages(message("m1", { triageId: TriageStatus.Triaged }));
    renderView({ initialStrategy: "newest" });

    expect(screen.getByText("–")).toBeInTheDocument();
  });
});
