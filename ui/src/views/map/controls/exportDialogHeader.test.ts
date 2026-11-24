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
    <div class="gl-export-field gl-export-field--northIcon"></div>`;
  document.body.append(root);

  return root;
}

const options = (over: Partial<HeaderFieldOptions> = {}): HeaderFieldOptions => ({
  enabled: true,
  classification: "intern",
  labels: {
    title: "Kartenkopf",
    classification: "Klassifizierung",
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
const select = (root: HTMLElement) =>
  root.querySelector<HTMLSelectElement>(".gl-export-field--mapHeaderClassification select")!;

describe("addHeaderFields", () => {
  it("adds a switch and the classification after the scale bar, like the fields of the dialog", () => {
    const root = dialog();
    addHeaderFields(root, options());

    const fields = [...root.querySelectorAll(".gl-export-field")].map((f) => f.className);
    const at = fields.findIndex((c) => c.includes("--scalebar"));
    expect(fields[at + 1]).toContain("gl-export-field--mapHeader");
    expect(fields[at + 2]).toContain("gl-export-field--mapHeaderClassification");

    expect(root.querySelector(".gl-export-field--mapHeader label")?.textContent).toContain(
      "Kartenkopf",
    );
    expect(toggle(root).checked).toBe(true);
    // the fields of the library are left as they were
    expect(root.querySelector("#s")).not.toBeNull();
    expect(root.querySelectorAll("#p")).toHaveLength(1);
  });

  it("gives the copies ids of their own, and the label points at its control", () => {
    const root = dialog();
    addHeaderFields(root, options());

    const input = toggle(root);
    expect(input.id).not.toBe("s");
    expect(root.querySelector(".gl-export-field--mapHeader label")?.getAttribute("for")).toBe(
      input.id,
    );
    expect(select(root).id).not.toBe("p");
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

  it("reports a change of the switch and of the classification", () => {
    const onChange = vi.fn();
    const root = dialog();
    addHeaderFields(root, options({ onChange }));

    toggle(root).checked = false;
    toggle(root).dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ enabled: false });

    select(root).value = "vertraulich";
    select(root).dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ classification: "vertraulich" });
  });

  it("hides the classification while the header is off", () => {
    const root = dialog();
    addHeaderFields(root, options({ enabled: false }));

    expect(
      root.querySelector<HTMLElement>(".gl-export-field--mapHeaderClassification")!.hidden,
    ).toBe(true);

    toggle(root).checked = true;
    toggle(root).dispatchEvent(new Event("change", { bubbles: true }));
    expect(
      root.querySelector<HTMLElement>(".gl-export-field--mapHeaderClassification")!.hidden,
    ).toBe(false);
  });

  it("turns the switch off for a format that cannot carry the header, and back for one that can", () => {
    const root = dialog();
    addHeaderFields(root, options());
    expect(toggle(root).disabled).toBe(false);

    root.querySelector<HTMLInputElement>("input[value=svg]")!.checked = true;
    root.querySelector<HTMLInputElement>("input[value=pdf]")!.checked = false;
    root.dispatchEvent(new Event("change", { bubbles: true }));
    expect(toggle(root).disabled).toBe(true);
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
