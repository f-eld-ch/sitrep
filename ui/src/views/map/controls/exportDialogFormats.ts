/**
 * The formats of the export dialog that are left out: for SVG and GeoTIFF the dialog's preview does
 * not work, and the map header cannot be put on them.
 */
export const HIDDEN_FORMATS = ["svg", "tif"] as const;

/**
 * Takes formats out of an open dialog.
 *
 * The library has no option for which formats it offers, so their buttons are hidden, not removed:
 * the dialog manages those elements itself. If the dialog is built differently, nothing is hidden.
 */
export function hideFormats(dialog: ParentNode, formats: readonly string[] = HIDDEN_FORMATS): void {
  for (const format of formats) {
    const radio = dialog.querySelector<HTMLInputElement>(
      `input[type=radio][name$='-format'][value='${format}']`,
    );
    const option = radio?.closest<HTMLElement>("label") ?? radio;
    if (option) {
      option.hidden = true;
      option.style.display = "none";
    }
  }
}
