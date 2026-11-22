import { getLabel } from "@f-eld-ch/babs-core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aliasFor } from "components/babs/iconResolver";
import { ColorForCategory } from "components/babs/lineAndZoneTypes";
import de from "../../../i18n/locales/de/translations.json";
import { SymbolPanel } from "./SymbolPanel";

type F = Feature<Geometry, GeoJsonProperties>;

/** The real German texts, with plurals and interpolation, so a missing key fails a test. */
function t(key: string, options?: Record<string, unknown>): string {
  const lookup = (k: string): unknown =>
    k.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], de);
  const plural =
    typeof options?.count === "number" ? (options.count === 1 ? "_one" : "_other") : "";
  const raw = lookup(key + plural) ?? lookup(key);
  if (typeof raw !== "string") return key;

  return raw.replace(/{{(\w+)}}/g, (_, name: string) => String(options?.[name] ?? ""));
}

const mocks = vi.hoisted(() => ({ ready: true }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t, i18n: { resolvedLanguage: "de", language: "de" } }),
}));
vi.mock("components/babs/useBabsIcons", () => ({ useBabsIcons: () => mocks.ready }));
vi.mock("@f-eld-ch/babs-react", () => ({
  BabsIcon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
  useBabsLang: () => ({ lang: "de", label: (id: never) => getLabel(id, "de") }),
}));

const point = (properties: GeoJsonProperties = {}, id = "f1"): F => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [8, 47] },
  properties,
});

const onUpdate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ready = true;
  window.localStorage.clear();
});

const search = (text: string) =>
  fireEvent.change(screen.getByRole("combobox", { name: "Symbol suchen" }), {
    target: { value: text },
  });

describe("SymbolPanel", () => {
  it("renders nothing without a feature, for a line, or before the catalogue is ready", () => {
    const { container, rerender } = render(<SymbolPanel feature={undefined} onUpdate={onUpdate} />);
    expect(container).toBeEmptyDOMElement();

    rerender(
      <SymbolPanel
        feature={{
          type: "Feature",
          id: "l1",
          geometry: {
            type: "LineString",
            coordinates: [
              [8, 47],
              [9, 48],
            ],
          },
          properties: {},
        }}
        onUpdate={onUpdate}
      />,
    );
    expect(container).toBeEmptyDOMElement();

    mocks.ready = false;
    rerender(<SymbolPanel feature={point()} onUpdate={onUpdate} />);
    expect(container).toBeEmptyDOMElement();
  });

  describe("a point without a symbol", () => {
    it("offers the search and the categories, with their names", () => {
      render(<SymbolPanel feature={point()} onUpdate={onUpdate} />);

      expect(screen.getByRole("combobox", { name: "Symbol suchen" })).toBeInTheDocument();
      expect(screen.getByText("Kategorien")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Fahrzeuge" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Formationen" })).toBeInTheDocument();
      // Bewegungen describes how a line is drawn: not a point category
      expect(screen.queryByRole("button", { name: "Bewegungen" })).not.toBeInTheDocument();
      // nothing used yet
      expect(screen.queryByText("Zuletzt verwendet")).not.toBeInTheDocument();
    });

    it("lists the matches as you type, best first, with where each one sits", () => {
      render(<SymbolPanel feature={point()} onUpdate={onUpdate} />);
      search("polizei zug");

      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveAttribute("aria-selected", "true");
      expect(within(options[0]).getByText("Zug")).toBeInTheDocument(); // highlighted part of "Zug-P"
      expect(options[0]).toHaveTextContent("Zug-P");
      expect(options[0]).toHaveTextContent("Formationen › Polizei");
      expect(options[1]).toHaveAttribute("aria-selected", "false");
      expect(screen.getAllByText("2 Ergebnisse")).not.toHaveLength(0);
    });

    it("says so when nothing matches", () => {
      render(<SymbolPanel feature={point()} onUpdate={onUpdate} />);
      search("xyzzy");

      expect(screen.queryAllByRole("option")).toHaveLength(0);
      expect(screen.getAllByText("Keine Symbole für «xyzzy»")).not.toHaveLength(0);
    });

    it("places the highlighted match with Enter", () => {
      render(<SymbolPanel feature={point({ name: "Kapo" })} onUpdate={onUpdate} />);
      search("polizei zug");
      fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({
        features: [
          {
            ...point({ name: "Kapo" }),
            properties: { name: "Kapo", icon: aliasFor("4103"), color: ColorForCategory["4"] },
          },
        ],
        action: "featureDetail",
      });
    });

    it("moves through the matches with the arrow keys", () => {
      render(<SymbolPanel feature={point()} onUpdate={onUpdate} />);
      search("polizei zug");
      const input = screen.getByRole("combobox");

      fireEvent.keyDown(input, { key: "ArrowDown" });
      expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
      expect(input).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[1].id);

      // not past the last one
      fireEvent.keyDown(input, { key: "ArrowDown" });
      expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");

      fireEvent.keyDown(input, { key: "ArrowUp" });
      fireEvent.keyDown(input, { key: "ArrowUp" });
      expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");

      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onUpdate.mock.calls[0][0].features[0].properties.icon).toBe(aliasFor("4108"));
    });

    it("places a match that is clicked", () => {
      render(<SymbolPanel feature={point()} onUpdate={onUpdate} />);
      search("ambulanz");
      fireEvent.click(screen.getAllByRole("option")[0]);

      expect(onUpdate.mock.calls[0][0].features[0].properties.icon).toBe(aliasFor("7114"));
    });

    it("finds a symbol through a word that is not in its name, and shows no such word", () => {
      render(<SymbolPanel feature={point()} onUpdate={onUpdate} />);
      search("kaputt");

      expect(screen.getAllByRole("option")[0]).toHaveTextContent("Beschaedigung");
      expect(screen.queryByText(/stichwort/i)).not.toBeInTheDocument();
    });

    it("clears the search with Escape, and with the button", () => {
      render(<SymbolPanel feature={point()} onUpdate={onUpdate} />);
      search("brand");
      fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
      expect(screen.getByRole("combobox")).toHaveValue("");
      expect(screen.queryAllByRole("option")).toHaveLength(0);

      search("brand");
      fireEvent.click(screen.getByRole("button", { name: "Suche leeren" }));
      expect(screen.getByRole("combobox")).toHaveValue("");
    });

    it("shows what was placed last, most recent first, and places it again with one click", () => {
      window.localStorage.setItem("sitrep.recentIcons", JSON.stringify(["7114", "4103"]));
      render(<SymbolPanel feature={point()} onUpdate={onUpdate} />);

      const section = screen.getByText("Zuletzt verwendet").closest("section")!;
      const tiles = within(section).getAllByRole("button");
      expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual(["Ambulanz", "Zug-P"]);

      fireEvent.click(tiles[1]);
      expect(onUpdate.mock.calls[0][0].features[0].properties.icon).toBe(aliasFor("4103"));
    });

    it("remembers what was placed", () => {
      render(<SymbolPanel feature={point()} onUpdate={onUpdate} />);
      search("ambulanz");
      fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

      expect(JSON.parse(window.localStorage.getItem("sitrep.recentIcons")!)).toEqual(["7114"]);
    });

    it("browses a category and places a symbol from it", () => {
      render(<SymbolPanel feature={point()} onUpdate={onUpdate} />);
      fireEvent.click(screen.getByRole("button", { name: "Fahrzeuge" }));

      expect(screen.getByRole("heading", { name: "Fahrzeuge" })).toBeInTheDocument();
      const tile = screen.getByRole("button", { name: "Ambulanz" });
      // the name shows where there is no tooltip, as on touch
      fireEvent.focus(tile);
      expect(screen.getAllByText("Ambulanz").length).toBeGreaterThan(0);

      fireEvent.click(tile);
      expect(onUpdate.mock.calls[0][0].features[0].properties.icon).toBe(aliasFor("7114"));
    });

    it("goes back from a category without placing anything", () => {
      render(<SymbolPanel feature={point()} onUpdate={onUpdate} />);
      fireEvent.click(screen.getByRole("button", { name: "Fahrzeuge" }));
      fireEvent.click(screen.getByRole("button", { name: "Zurück" }));

      expect(screen.getByText("Kategorien")).toBeInTheDocument();
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("opens the partner first in Formationen, then its ranks", () => {
      render(<SymbolPanel feature={point()} onUpdate={onUpdate} />);
      fireEvent.click(screen.getByRole("button", { name: "Formationen" }));

      // first level: the partners, named by their group
      expect(screen.getByRole("button", { name: "Polizei" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Zug-P" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Polizei" }));
      fireEvent.click(screen.getByRole("button", { name: "Zug-P" }));
      expect(onUpdate.mock.calls[0][0].features[0].properties.icon).toBe(aliasFor("4103"));
    });

    it("steps back through the two levels of Formationen", () => {
      render(<SymbolPanel feature={point()} onUpdate={onUpdate} />);
      fireEvent.click(screen.getByRole("button", { name: "Formationen" }));
      fireEvent.click(screen.getByRole("button", { name: "Polizei" }));

      fireEvent.click(screen.getByRole("button", { name: "Zurück" }));
      expect(screen.getByRole("button", { name: "Feuerwehr" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Zurück" }));
      expect(screen.getByText("Kategorien")).toBeInTheDocument();
    });
  });

  describe("a point with a symbol", () => {
    const placed = () => point({ icon: aliasFor("4103") });

    it("shows the symbol and a button to change it, nothing else", () => {
      render(<SymbolPanel feature={placed()} onUpdate={onUpdate} />);

      expect(screen.getByText("Zug-P")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ändern" })).toBeInTheDocument();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("opens the search to change it, and can be left again", () => {
      render(<SymbolPanel feature={placed()} onUpdate={onUpdate} />);
      fireEvent.click(screen.getByRole("button", { name: "Ändern" }));

      expect(screen.getByRole("combobox")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("replaces the symbol and folds up again", () => {
      render(<SymbolPanel feature={placed()} onUpdate={onUpdate} />);
      fireEvent.click(screen.getByRole("button", { name: "Ändern" }));
      search("ambulanz");
      fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

      expect(onUpdate.mock.calls[0][0].features[0].properties.icon).toBe(aliasFor("7114"));
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("leaves the change with Escape on an empty search", () => {
      render(<SymbolPanel feature={placed()} onUpdate={onUpdate} />);
      fireEvent.click(screen.getByRole("button", { name: "Ändern" }));
      fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("copes with a stored icon the catalogue does not know", () => {
      render(<SymbolPanel feature={point({ icon: "unbekannt" })} onUpdate={onUpdate} />);

      expect(screen.getByRole("button", { name: "Ändern" })).toBeInTheDocument();
    });
  });

  it("starts afresh when another point is selected", () => {
    const { rerender } = render(<SymbolPanel feature={point({}, "a")} onUpdate={onUpdate} />);
    search("brand");
    expect(screen.getByRole("combobox")).toHaveValue("brand");

    rerender(<SymbolPanel feature={point({}, "b")} onUpdate={onUpdate} />);
    expect(screen.getByRole("combobox")).toHaveValue("");
  });
});
