import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Resource, SchadenplatzWithResources } from "api";
import { IncidentContext } from "utils";
import {
  type Division,
  type Incident,
  Medium,
  type Message,
  PriorityStatus,
  TriageStatus,
} from "types";
import de from "../../i18n/locales/de/translations.json";
import fr from "../../i18n/locales/fr/translations.json";
import it_ from "../../i18n/locales/it/translations.json";

// Shared fixtures and wrappers for the TriageView tests. The real locale files back the
// translations, so a missing key fails the test instead of rendering silently.
const locales: Record<string, unknown> = { de, fr, it: it_ };
export const testLanguage = { current: "de" };

export function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      locales[testLanguage.current],
    );
  if (typeof value !== "string") throw new Error(`missing translation key: ${key}`);
  return value;
}

export const divisionSc = {
  id: "d-sc",
  name: "SC",
  description: "Stabschef",
  kind: "STANDARD",
} as Division;
export const divisionLog = {
  id: "d-log",
  name: "LOG",
  description: "Logistik",
  kind: "STANDARD",
} as Division;

export function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    number: 1,
    content: `content-${id}`,
    sender: "A",
    senderDetail: "",
    receiver: "B",
    receiverDetail: "",
    time: new Date("2026-01-15T10:00:00Z"),
    createdAt: new Date("2026-01-15T10:00:00Z"),
    updatedAt: new Date("2026-01-15T10:00:00Z"),
    deletedAt: new Date(0),
    divisions: [],
    medium: Medium.Radio,
    triageId: TriageStatus.Pending,
    priorityId: PriorityStatus.Normal,
    attachments: [],
    acknowledgements: [],
    author: "",
    ...overrides,
  };
}

export function resource(id: string, overrides: Partial<Resource> = {}): Resource {
  return {
    id,
    incidentId: "inc-1",
    schadenplatzId: "sp-default",
    formation: "FW",
    name: `Gruppe ${id}`,
    size: "GRUPPE",
    personnelCount: 8,
    hauptaufgabe: "",
    contact: null,
    homeLocation: { name: "Altdorf" },
    deploymentLocation: null,
    status: "EINSATZBEREIT",
    statusAt: "2026-01-15T08:00:00Z",
    alertedAt: "2026-01-15T08:00:00Z",
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
  } as Resource;
}

export const noCasualties = {
  vermisste: 0,
  tote: 0,
  verletzte: 0,
  obdachlose: 0,
  eingeschlossene: 0,
};

export function schadenplatz(
  id: string,
  overrides: Partial<SchadenplatzWithResources> = {},
): SchadenplatzWithResources {
  return {
    id,
    incidentId: "inc-1",
    name: id,
    isDefault: false,
    isMerged: false,
    mergedInto: null,
    casualties: noCasualties,
    resources: [],
    ...overrides,
  };
}

export function Providers({
  children,
  divisions = [divisionSc, divisionLog],
  closed = false,
}: {
  children: ReactNode;
  divisions?: Division[];
  closed?: boolean;
}) {
  const incident = {
    id: "inc-1",
    name: "Hochwasser",
    divisions,
    closedAt: closed ? new Date("2026-01-16T00:00:00Z") : null,
  } as unknown as Incident;
  return (
    <IncidentContext.Provider
      value={{ state: { incident, loadedForId: "inc-1" }, dispatch: () => null }}
    >
      <MemoryRouter initialEntries={["/incident/inc-1/triage"]}>
        <Routes>
          <Route path="/incident/:incidentId/triage" element={children} />
        </Routes>
      </MemoryRouter>
    </IncidentContext.Provider>
  );
}
