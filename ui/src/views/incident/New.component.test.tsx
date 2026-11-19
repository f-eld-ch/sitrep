import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Division } from "types";
import type { Incident } from "types/incident";
import { ApiError } from "../../api/errors";
import { loadingResult, readyResult } from "../../api/testing/results";
import de from "../../i18n/locales/de/translations.json";
import en from "../../i18n/locales/en/translations.json";
import fr from "../../i18n/locales/fr/translations.json";
import it_ from "../../i18n/locales/it/translations.json";
import { IncidentForm, New } from "./New";

// The real locale files, so a missing translation fails the test.
const locales: Record<string, unknown> = { de, fr, it: it_, en };
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
  useTranslation: () => ({ t: lookup, i18n: { language } }),
}));

const api = vi.hoisted(() => ({
  useCreateIncident: vi.fn(),
  useUpdateIncident: vi.fn(),
  useIncidents: vi.fn(),
  useLinkIncidentParent: vi.fn(),
  useUnlinkIncidentParent: vi.fn(),
}));
vi.mock("api", () => api);

const idle = { loading: false, error: undefined };

function incident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: "i1",
    parentId: null,
    name: "Hochwasser",
    createdAt: new Date(0),
    updatedAt: null,
    deletedAt: null,
    closedAt: null,
    hasReview: false,
    canWrite: true,
    canManage: true,
    canDelete: true,
    canManageAccess: true,
    accessMode: "OPEN_OPERATIONAL",
    location: { id: "l1", name: "Bern", coordinates: "" },
    divisions: [],
    childIncidents: [],
    layers: [],
    ...overrides,
  };
}

const division = (id: string, name: string, description: string, kind = "STANDARD"): Division =>
  ({ id, name, description, kind }) as Division;

function Where() {
  return <p>at {useLocation().pathname}</p>;
}

function renderRoute(element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/incident/new"]}>
      <Routes>
        <Route path="/incident/new" element={element} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const nameInput = () => screen.getByLabelText(de.incidentName);
const saveButton = () => screen.getByRole("button", { name: de.save });
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe("New incident page", () => {
  const createIncident = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    language = "de";
    createIncident.mockResolvedValue({ incidentId: "new-id" });
    api.useCreateIncident.mockReturnValue([createIncident, idle]);
    api.useUpdateIncident.mockReturnValue([vi.fn(), idle]);
    api.useLinkIncidentParent.mockReturnValue([vi.fn(), idle]);
    api.useUnlinkIncidentParent.mockReturnValue([vi.fn(), idle]);
    api.useIncidents.mockReturnValue(
      readyResult({
        incidents: [
          incident({ id: "p1", name: "Parent A" }),
          incident({ id: "p2", name: "Closed parent", closedAt: new Date() }),
          incident({ id: "p3", name: "Deleted parent", deletedAt: new Date() }),
          incident({ id: "p4", name: "Child", parentId: "p1" }),
        ],
      }),
    );
  });

  it.each([
    ["de", de],
    ["fr", fr],
    ["it", it_],
  ])("shows the title and the two default divisions in %s", (lang, texts) => {
    language = lang;
    renderRoute(<New />);

    expect(screen.getByRole("heading", { name: texts.createIncident })).toBeInTheDocument();
    expect(screen.getByDisplayValue(texts.divisionsNames.CLage.name)).toBeInTheDocument();
    expect(screen.getByDisplayValue(texts.divisionsNames.CLage.description)).toBeInTheDocument();
    expect(screen.getByDisplayValue(texts.divisionsNames.SC.name)).toBeInTheDocument();
    // the message map division is created by the backend and not offered
    expect(screen.queryByDisplayValue(texts.divisionsNames.Karte.description)).toBeNull();
  });

  it("cannot be saved without a name", () => {
    renderRoute(<New />);

    expect(saveButton()).toBeDisabled();
    type(nameInput(), "   ");
    expect(saveButton()).toBeDisabled();
    type(nameInput(), "Brand");
    expect(saveButton()).toBeEnabled();
  });

  it("creates the incident with its location, parent and divisions and opens its journal", async () => {
    renderRoute(<New />);

    type(nameInput(), "Brand");
    type(screen.getByLabelText(de.location), "Thun");
    type(screen.getByLabelText(de.parentIncident), "p1");
    fireEvent.click(saveButton());

    expect(createIncident).toHaveBeenCalledWith({
      name: "Brand",
      parentId: "p1",
      location: "Thun",
      divisions: [
        { name: de.divisionsNames.CLage.name, description: de.divisionsNames.CLage.description },
        { name: de.divisionsNames.SC.name, description: de.divisionsNames.SC.description },
      ],
    });
    expect(await screen.findByText("at /new-id/journal/view")).toBeInTheDocument();
  });

  it("offers only open, top-level incidents as parent", () => {
    renderRoute(<New />);

    const select = screen.getByLabelText(de.parentIncident);
    const options = within(select).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([de.noParentIncident, "Parent A"]);
  });

  it("offers no parent while the incidents load", () => {
    api.useIncidents.mockReturnValue(loadingResult());
    renderRoute(<New />);

    expect(within(screen.getByLabelText(de.parentIncident)).getAllByRole("option")).toHaveLength(1);
  });

  it("stays on the page and shows the translated error when creating fails", async () => {
    createIncident.mockRejectedValue(new ApiError("CONFLICT"));
    api.useCreateIncident.mockReturnValue([
      createIncident,
      { loading: false, error: new ApiError("CONFLICT") },
    ]);
    renderRoute(<New />);

    type(nameInput(), "Brand");
    fireEvent.click(saveButton());

    await waitFor(() => expect(createIncident).toHaveBeenCalled());
    expect(screen.getByText(de.errors.CONFLICT)).toBeInTheDocument();
    expect(screen.queryByText(/^at /)).not.toBeInTheDocument();
  });

  describe("divisions", () => {
    const addDivision = () => screen.getByRole("button", { name: de.add });
    const newDescription = () => screen.getAllByPlaceholderText(de.name).at(-1) as HTMLElement;
    const newShort = () => screen.getAllByPlaceholderText(de.short).at(-1) as HTMLElement;

    it("only allows adding a division with both a short name and a description", () => {
      renderRoute(<New />);

      expect(addDivision()).toBeDisabled();
      type(newShort(), "Log");
      expect(addDivision()).toBeDisabled();
      type(newDescription(), "  ");
      expect(addDivision()).toBeDisabled();
      type(newDescription(), "Logistik");
      expect(addDivision()).toBeEnabled();
    });

    it("adds a division, empties the inputs and sends it on save", async () => {
      renderRoute(<New />);

      type(newShort(), "Log");
      type(newDescription(), "Logistik");
      fireEvent.click(addDivision());

      expect(screen.getByDisplayValue("Logistik")).toBeInTheDocument();
      expect(newShort()).toHaveValue("");
      expect(newDescription()).toHaveValue("");

      type(nameInput(), "Brand");
      fireEvent.click(saveButton());
      expect(createIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          divisions: expect.arrayContaining([{ name: "Log", description: "Logistik" }]),
        }),
      );
      await screen.findByText(/^at /);
    });

    it("does not add a second division with the same short name", () => {
      renderRoute(<New />);

      type(newShort(), de.divisionsNames.SC.name);
      type(newDescription(), "Duplicate");
      fireEvent.click(addDivision());

      expect(screen.queryByDisplayValue("Duplicate")).not.toBeInTheDocument();
      expect(screen.getAllByDisplayValue(de.divisionsNames.SC.name)).toHaveLength(1);
    });

    it("edits a division in place", async () => {
      renderRoute(<New />);

      type(screen.getByDisplayValue(de.divisionsNames.SC.description), "Chef");
      type(screen.getByDisplayValue(de.divisionsNames.SC.name), "CH");
      type(nameInput(), "Brand");
      fireEvent.click(saveButton());

      expect(createIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          divisions: expect.arrayContaining([{ name: "CH", description: "Chef" }]),
        }),
      );
      await screen.findByText(/^at /);
    });

    it("removes a new division with a translated button", () => {
      renderRoute(<New />);

      const buttons = screen.getAllByRole("button", { name: lookup("removeDivision") });
      // an untranslated key would be read out to screen reader users as is
      expect(buttons[0]).not.toHaveAccessibleName("removeDivision");
      expect(buttons).toHaveLength(2);

      fireEvent.click(buttons[0]);

      expect(screen.queryByDisplayValue(de.divisionsNames.CLage.name)).not.toBeInTheDocument();
      expect(screen.getByDisplayValue(de.divisionsNames.SC.name)).toBeInTheDocument();
    });
  });
});

describe("IncidentForm when editing", () => {
  const updateIncident = vi.fn();
  const linkParent = vi.fn();
  const unlinkParent = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    language = "de";
    updateIncident.mockResolvedValue(undefined);
    linkParent.mockResolvedValue(undefined);
    unlinkParent.mockResolvedValue(undefined);
    api.useCreateIncident.mockReturnValue([vi.fn(), idle]);
    api.useUpdateIncident.mockReturnValue([updateIncident, idle]);
    api.useLinkIncidentParent.mockReturnValue([linkParent, idle]);
    api.useUnlinkIncidentParent.mockReturnValue([unlinkParent, idle]);
    api.useIncidents.mockReturnValue(
      readyResult({
        incidents: [
          incident({ id: "p1", name: "Parent A" }),
          incident({ id: "p2", name: "Old parent", closedAt: new Date() }),
        ],
      }),
    );
  });

  const existing = incident({
    parentId: "p2",
    divisions: [
      division("d1", "SC", "Stabschef"),
      division("d2", "", ""),
      division("d-map", "Karte", "Nachrichtenkarte", "MESSAGE_MAP"),
    ],
  });

  it("shows the stored values, with fallbacks for blank divisions and without system divisions", () => {
    renderRoute(<IncidentForm incident={existing} />);

    expect(nameInput()).toHaveValue("Hochwasser");
    expect(screen.getByLabelText(de.location)).toHaveValue("Bern");
    expect(screen.getByDisplayValue("Stabschef")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Division 2")).toHaveLength(2);
    expect(screen.queryByDisplayValue("Nachrichtenkarte")).not.toBeInTheDocument();
  });

  it("keeps a closed current parent selectable", () => {
    renderRoute(<IncidentForm incident={existing} />);

    const select = screen.getByLabelText(de.parentIncident);
    expect(select).toHaveValue("p2");
    expect(within(select).getAllByRole("option")).toHaveLength(3);
  });

  it("does not let existing divisions be removed", () => {
    renderRoute(<IncidentForm incident={existing} />);

    expect(
      screen.queryByRole("button", { name: lookup("removeDivision") }),
    ).not.toBeInTheDocument();
  });

  it("hides the parent selector for an incident that has children", () => {
    renderRoute(<IncidentForm incident={incident({ childIncidents: [incident({ id: "c" })] })} />);

    expect(screen.queryByLabelText(de.parentIncident)).not.toBeInTheDocument();
  });

  it("updates the incident keeping division ids, and opens the journal", async () => {
    renderRoute(<IncidentForm incident={existing} />);

    type(nameInput(), "Hochwasser 2");
    type(screen.getByLabelText(de.location), "Thun");
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(updateIncident).toHaveBeenCalledWith({
        incidentId: "i1",
        name: "Hochwasser 2",
        location: "Thun",
        divisions: [
          { id: "d1", name: "SC", description: "Stabschef" },
          { id: "d2", name: "Division 2", description: "Division 2" },
        ],
      }),
    );
    expect(linkParent).not.toHaveBeenCalled();
    expect(unlinkParent).not.toHaveBeenCalled();
    expect(await screen.findByText("at /journal/view")).toBeInTheDocument();
  });

  it("links a newly chosen parent", async () => {
    renderRoute(<IncidentForm incident={existing} />);

    type(screen.getByLabelText(de.parentIncident), "p1");
    fireEvent.click(saveButton());

    await waitFor(() => expect(linkParent).toHaveBeenCalledWith({ childId: "i1", parentId: "p1" }));
    expect(unlinkParent).not.toHaveBeenCalled();
  });

  it("unlinks the parent when none is chosen any more", async () => {
    renderRoute(<IncidentForm incident={existing} />);

    type(screen.getByLabelText(de.parentIncident), "");
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(unlinkParent).toHaveBeenCalledWith({ childId: "i1", parentId: "p2" }),
    );
    expect(linkParent).not.toHaveBeenCalled();
  });

  it("does not open the journal when the update fails and shows the translated error", async () => {
    updateIncident.mockRejectedValue(new ApiError("FORBIDDEN"));
    api.useUpdateIncident.mockReturnValue([
      updateIncident,
      { loading: false, error: new ApiError("FORBIDDEN") },
    ]);
    renderRoute(<IncidentForm incident={existing} />);

    fireEvent.click(saveButton());

    await waitFor(() => expect(updateIncident).toHaveBeenCalled());
    expect(screen.getByText(de.errors.FORBIDDEN)).toBeInTheDocument();
    expect(linkParent).not.toHaveBeenCalled();
    expect(screen.queryByText(/^at /)).not.toBeInTheDocument();
  });

  it("shows the translated error when changing the parent fails", () => {
    api.useLinkIncidentParent.mockReturnValue([
      linkParent,
      { loading: false, error: new ApiError("INVALID_PARENT_INCIDENT") },
    ]);
    renderRoute(<IncidentForm incident={existing} />);

    expect(screen.getByText(de.errors.INVALID_PARENT_INCIDENT)).toBeInTheDocument();
  });
});
