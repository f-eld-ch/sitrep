import { describe, expect, it } from "vitest";
import { REVIEW_PAGE_STYLE, unfoldForPrint } from "./print";

const html = (markup: string) => {
  const root = document.createElement("div");
  root.innerHTML = markup;

  return root;
};

describe("unfoldForPrint", () => {
  it("opens the folded sections marked for the printout, and folds them again afterwards", () => {
    const root = html(`
      <details id="marked" data-print-open><summary>Vergleich</summary>x</details>
      <details id="other"><summary>Tabelle</summary>y</details>`);
    const marked = root.querySelector<HTMLDetailsElement>("#marked");
    const other = root.querySelector<HTMLDetailsElement>("#other");

    const restore = unfoldForPrint(root);

    expect(marked?.open).toBe(true);
    expect(other?.open).toBe(false);

    restore();

    expect(marked?.open).toBe(false);
  });

  it("leaves a section the user had open open", () => {
    const root = html(
      '<details id="a" data-print-open open><summary>Vergleich</summary>x</details>',
    );
    const details = root.querySelector<HTMLDetailsElement>("#a");

    unfoldForPrint(root)();

    expect(details?.open).toBe(true);
  });

  it("does nothing for a page with nothing folded", () => {
    expect(() => unfoldForPrint(html("<p>text</p>"))()).not.toThrow();
  });
});

describe("REVIEW_PAGE_STYLE", () => {
  it("is A4 upright", () => {
    expect(REVIEW_PAGE_STYLE).toContain("A4 portrait");
  });

  it("sets a smaller base size, so the sizes in rem shrink with it", () => {
    expect(REVIEW_PAGE_STYLE).toMatch(/html \{ font-size: 1[0-4]px; \}/);
  });
});
