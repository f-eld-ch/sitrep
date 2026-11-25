import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addHeaderFields,
  dialogCanCarryHeader,
  type HeaderFieldOptions,
} from "./exportDialogHeader";

/** The part of the library's dialog the fields are copied from, as it is built. */
function dialog(format = "pdf", vector = false): HTMLElement {
  const root = document.createElement("div");
  root.className = "gl-export-dialog";
  root.innerHTML = `
    <div class="gl-export-dialog__page"><canvas class="gl-export-dialog__canvas" width="670" height="474"></canvas></div>
    <div class="gl-export-field gl-export-field--pageSize svelte-x">
      <label class="gl-export-field__label svelte-x" for="p"><span aria-hidden="true" class="gl-export-icon gl-export-icon--pageSize"><svg class="icon"></svg></span> <span>Page Size</span></label>
      <div class="gl-export-field__control"><select id="p" name="p"><option value="a">A3</option></select></div>
    </div>
    ${["jpg", "png", "webp", "pdf", "svg", "tif"]
      .map(
        (f) =>
          `<input type="radio" name="gl-export-1-format" value="${f}" ${f === format ? "checked" : ""}>`,
      )
      .join("")}
    <input type="checkbox" id="gl-export-1-vector" ${vector ? "checked" : ""}>
    <div class="gl-export-field gl-export-field--scalebar gl-export-field--switch svelte-x">
      <label class="gl-export-field__label svelte-x" for="s"><span aria-hidden="true" class="gl-export-icon gl-export-icon--scalebar"><svg class="icon"></svg></span> <span>Scale bar</span></label>
      <div class="gl-export-field__control"><input class="gl-export-switch" type="checkbox" role="switch" id="s" name="s"></div>
    </div>
    <div class="gl-export-field gl-export-field--northIcon gl-export-field--switch"></div>
    <div class="gl-export-field-group gl-export-field-group--northIcon">
      <div class="gl-export-field gl-export-field--northIconSymbol gl-export-field--inline">
        <label class="gl-export-field__label"><span aria-hidden="true" class="gl-export-icon gl-export-icon--northIconSymbol"><svg></svg></span> <span>Icon symbol</span></label>
        <div class="gl-export-field__control"><button type="button" class="gl-export-north-icon-picker">x</button></div>
      </div>
    </div>
    <div class="gl-export-field gl-export-field--fileName">
      <label class="gl-export-field__label" for="f"><span>File name</span></label>
      <div class="gl-export-field__control"><input class="gl-export-input" type="text" id="f" name="f" value="map"></div>
    </div>`;
  document.body.append(root);

  return root;
}

const options = (over: Partial<HeaderFieldOptions> = {}): HeaderFieldOptions => ({
  enabled: true,
  classification: "intern",
  organisation: "",
  keeper: "",
  defaults: { organisation: "sitrep.example.ch", keeper: "Erika Muster" },
  maxLength: 80,
  labels: {
    title: "Kartenkopf",
    classification: "Klassifizierung",
    organisation: "Organisation",
    keeper: "Kartenführung",
    unavailable: "Nicht möglich",
    classifications: { intern: "Intern", vertraulich: "Vertraulich", geheim: "Geheim" },
  },
  onChange: vi.fn(),
  ...over,
});

afterEach(() => {
  document.body.replaceChildren();
});

const toggle = (root: HTMLElement) =>
  root.querySelector<HTMLInputElement>(".gl-export-field--mapHeader input")!;
const group = (root: HTMLElement) =>
  root.querySelector<HTMLElement>(".gl-export-field-group--mapHeader")!;
const row = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLElement>(`.gl-export-field--mapHeader-${name}`)!;
const select = (root: HTMLElement) => row(root, "classification").querySelector("select")!;
const input = (root: HTMLElement, name: string) => row(root, name).querySelector("input")!;

describe("addHeaderFields", () => {
  it("adds a switch and a group of details after the scale bar, like the dialog's north icon", () => {
    const root = dialog();
    addHeaderFields(root, options());

    const children = [...root.querySelectorAll(".gl-export-field, .gl-export-field-group")].map(
      (f) => f.className,
    );
    const at = children.findIndex((c) => c.includes("--scalebar"));
    expect(children[at + 1]).toContain("gl-export-field--mapHeader ");
    expect(children[at + 2]).toContain("gl-export-field-group--mapHeader");

    // the rows are rows of the group, built like the ones of the north icon
    expect([...group(root).children].map((c) => c.className.replace(/ svelte-\w+/g, ""))).toEqual([
      "gl-export-field gl-export-field--mapHeader-classification gl-export-field--inline",
      "gl-export-field gl-export-field--mapHeader-organisation gl-export-field--inline",
      "gl-export-field gl-export-field--mapHeader-keeper gl-export-field--inline",
    ]);
    expect(row(root, "keeper").querySelector("label")?.textContent).toContain("Kartenführung");
    expect(toggle(root).checked).toBe(true);
    // the north icon's own group is left as it was
    expect(root.querySelector(".gl-export-field-group--northIcon")).not.toBeNull();
    expect(root.querySelectorAll(".gl-export-north-icon-picker")).toHaveLength(1);
  });

  it("gives the copies ids of their own, and every label points at its control", () => {
    const root = dialog();
    addHeaderFields(root, options());

    const ids = [
      toggle(root),
      select(root),
      input(root, "organisation"),
      input(root, "keeper"),
    ].map((c) => c.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids).not.toContain("s");
    expect(ids).not.toContain("p");
    expect(ids).not.toContain("f");
    for (const name of ["classification", "organisation", "keeper"]) {
      expect(row(root, name).querySelector("label")?.getAttribute("for")).toBe(
        row(root, name).querySelector("select, input")?.id,
      );
    }
  });

  it("lists the classifications in the language given, and shows the chosen one", () => {
    const root = dialog();
    addHeaderFields(root, options({ classification: "geheim" }));

    expect([...select(root).options].map((o) => o.textContent)).toEqual([
      "Intern",
      "Vertraulich",
      "Geheim",
    ]);
    expect(select(root).value).toBe("geheim");
  });

  it("shows what is typed, and the automatic values as what the empty fields would give", () => {
    const root = dialog();
    addHeaderFields(root, options({ organisation: "ZSO Musterwil" }));

    expect(input(root, "organisation").value).toBe("ZSO Musterwil");
    expect(input(root, "keeper").value).toBe("");
    expect(input(root, "keeper").placeholder).toBe("Erika Muster");
    expect(input(root, "organisation").maxLength).toBe(80);
  });

  it("reports a change of the switch, of the classification and of the texts", () => {
    const onChange = vi.fn();
    const root = dialog();
    addHeaderFields(root, options({ onChange }));

    toggle(root).checked = false;
    toggle(root).dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ enabled: false });

    select(root).value = "vertraulich";
    select(root).dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ classification: "vertraulich" });

    input(root, "organisation").value = "  ZSO Musterwil ";
    input(root, "organisation").dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ organisation: "ZSO Musterwil" });

    input(root, "keeper").value = "E. Muster";
    input(root, "keeper").dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ keeper: "E. Muster" });
  });

  it("hides the group while the header is off", () => {
    const root = dialog();
    addHeaderFields(root, options({ enabled: false }));

    expect(group(root).hidden).toBe(true);
    expect(group(root).style.display).toBe("none");

    toggle(root).checked = true;
    toggle(root).dispatchEvent(new Event("change", { bubbles: true }));
    expect(group(root).hidden).toBe(false);
    expect(group(root).style.display).toBe("");
  });

  it("turns the switch off for a format that cannot carry the header, and back for one that can", () => {
    const root = dialog();
    addHeaderFields(root, options());
    expect(toggle(root).disabled).toBe(false);

    root.querySelector<HTMLInputElement>("input[value=svg]")!.checked = true;
    root.querySelector<HTMLInputElement>("input[value=pdf]")!.checked = false;
    root.dispatchEvent(new Event("change", { bubbles: true }));
    expect(toggle(root).disabled).toBe(true);
    expect(group(root).hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".gl-export-field--mapHeader")!.title).toBe(
      "Nicht möglich",
    );

    root.querySelector<HTMLInputElement>("input[value=png]")!.checked = true;
    root.querySelector<HTMLInputElement>("input[value=svg]")!.checked = false;
    root.dispatchEvent(new Event("change", { bubbles: true }));
    expect(toggle(root).disabled).toBe(false);
  });

  it("adds nothing twice, and nothing to a dialog it does not know", () => {
    const root = dialog();
    addHeaderFields(root, options());
    addHeaderFields(root, options());
    expect(root.querySelectorAll(".gl-export-field--mapHeader")).toHaveLength(1);

    const other = document.createElement("div");
    expect(() => addHeaderFields(other, options())).not.toThrow();
    expect(other.children).toHaveLength(0);
  });

  it("adds nothing when a field it copies is missing from the dialog", () => {
    const root = dialog();
    root.querySelector(".gl-export-field-group--northIcon")!.remove();

    addHeaderFields(root, options());

    expect(root.querySelector(".gl-export-field--mapHeader")).toBeNull();
  });
});

describe("the preview", () => {
  const header = {
    classification: "intern",
    organisation: "x",
    eventName: "Brand",
    scale: 25000,
    state: new Date(2026, 10, 24, 9, 30),
    keeper: "k",
    text: {
      classification: { intern: "Intern", vertraulich: "Vertraulich", geheim: "Geheim" },
      mapType: "Führungskarte",
      baseMapLabel: "Basiskarte",
      baseMap: "Landeskarte",
      scaleLabel: "Massstab",
      state: "Stand",
      keeper: "Kartenführung",
    },
  } as never;

  it("gets a canvas over the page, drawn again when the details change, and taken away with the fields", () => {
    const root = dialog();
    const preview = vi.fn(() => ({ header, size: [420, 297] as [number, number] }));
    const fields = addHeaderFields(root, options({ preview }));

    const overlay = root.querySelector<HTMLCanvasElement>(".gl-export-header-preview")!;
    expect(overlay).not.toBeNull();
    // the size of the page canvas it lies over
    expect(overlay.width).toBe(670);
    expect(overlay.height).toBe(474);
    const calls = preview.mock.calls.length;

    input(root, "keeper").dispatchEvent(new Event("input", { bubbles: true }));
    expect(preview.mock.calls.length).toBeGreaterThan(calls);

    fields.refresh();
    fields.dispose();
    expect(root.querySelector(".gl-export-header-preview")).toBeNull();
  });

  it("asks for no header while the switch is off or the format cannot carry it", () => {
    const root = dialog();
    const preview = vi.fn(() => undefined);
    addHeaderFields(root, options({ enabled: false, preview }));

    expect(preview).not.toHaveBeenCalled();
  });
});

describe("dialogCanCarryHeader", () => {
  it.each([
    ["pdf", false, true],
    ["png", false, true],
    ["jpg", false, true],
    ["webp", false, true],
    ["pdf", true, false],
    ["svg", false, false],
    ["tif", false, false],
  ])("for %s with vector %s: %s", (format, vector, expected) => {
    expect(dialogCanCarryHeader(dialog(format, vector))).toBe(expected);
  });
});
