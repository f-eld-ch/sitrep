/**
 * Opens what is folded away in the report and belongs in the printout, here the comparison with
 * the other incidents, and returns what folds it again. Marked in the markup with
 * `data-print-open`; anything else that is folded stays out of the PDF.
 *
 * The printout is a copy of the page taken when printing starts, so this has to happen before.
 */
export function unfoldForPrint(root: HTMLElement): () => void {
  const folded = Array.from(
    root.querySelectorAll<HTMLDetailsElement>("details[data-print-open]:not([open])"),
  );

  for (const details of folded) details.open = true;

  return () => {
    for (const details of folded) details.open = false;
  };
}

/** The page of the PDF: A4 upright. The margins and the page numbers come from the app's styles. */
export const REVIEW_PAGE_STYLE = "@page { size: A4 portrait; } html { font-size: 13px; }";
