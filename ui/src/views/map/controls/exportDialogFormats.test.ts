import { afterEach, describe, expect, it } from "vitest";
import { hideFormats, HIDDEN_FORMATS } from "./exportDialogFormats";

function dialog(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `<div role="radiogroup">${["jpg", "png", "webp", "pdf", "svg", "tif"]
    .map(
      (f) =>
        `<label class="gl-export-segmented__option"><input type="radio" name="gl-export-1-format" value="${f}"><span>${f}</span></label>`,
    )
    .join("")}</div>`;
  document.body.append(root);

  return root;
}

afterEach(() => document.body.replaceChildren());

const visible = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLInputElement>("input[type=radio]")]
    .filter((r) => r.closest<HTMLElement>("label")!.style.display !== "none")
    .map((r) => r.value);

describe("hideFormats", () => {
  it("hides SVG and GeoTIFF, with their buttons, and keeps the others", () => {
    const root = dialog();

    hideFormats(root);

    expect(visible(root)).toEqual(["jpg", "png", "webp", "pdf"]);
    expect(HIDDEN_FORMATS).toEqual(["svg", "tif"]);
    // hidden, not removed: the dialog manages the elements
    expect(root.querySelectorAll("input[type=radio]")).toHaveLength(6);
  });

  it("hides what it is asked to", () => {
    const root = dialog();

    hideFormats(root, ["webp"]);

    expect(visible(root)).toEqual(["jpg", "png", "pdf", "svg", "tif"]);
  });

  it("does nothing to a dialog it does not know", () => {
    const other = document.createElement("div");

    expect(() => hideFormats(other)).not.toThrow();
  });
});
