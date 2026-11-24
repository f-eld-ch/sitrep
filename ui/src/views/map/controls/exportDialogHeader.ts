import { CLASSIFICATIONS, type Classification } from "./exportHeader";

/**
 * Puts the map header into the export dialog, as two more fields in the style of the others: a
 * switch like the one of the scale bar, and the classification of the sheet below it.
 *
 * The dialog belongs to @watergis/maplibre-gl-export and has no place for fields of ours. It is
 * built from stable `gl-export-*` classes, so the two fields are copies of its own scale bar and
 * page size fields, with their own ids and listeners. If the dialog changes so that the fields
 * to copy are not found, nothing is added and the export goes on as it was.
 */

export interface HeaderFieldOptions {
  enabled: boolean;
  classification: Classification;
  labels: {
    title: string;
    classification: string;
    /** Why the switch is off for a format that cannot carry the header. */
    unavailable: string;
    classifications: Record<Classification, string>;
  };
  onChange: (change: { enabled?: boolean; classification?: Classification }) => void;
}

/** The formats whose page is an image the header can be drawn on. */
const FORMATS_WITH_HEADER = new Set(["pdf", "png", "jpg", "webp"]);

/** The icon "tag" of Lucide, the set the dialog's own icons come from. */
const TAG_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"></path><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"></circle></svg>';

/** The format and vector choice the dialog is showing: whether the page is an image. */
export function dialogCanCarryHeader(dialog: ParentNode): boolean {
  const format = dialog.querySelector<HTMLInputElement>(
    "input[type=radio][name$='-format']:checked",
  );
  const vector = dialog.querySelector<HTMLInputElement>("input[type=checkbox][id$='-vector']");

  return FORMATS_WITH_HEADER.has(format?.value ?? "") && !vector?.checked;
}

let counter = 0;

/** Copies a field of the dialog under a new name, ready to be given its own content. */
function copyField(source: HTMLElement, name: string, id: string): HTMLElement {
  const copy = source.cloneNode(true) as HTMLElement;

  // setAttribute, not className: an SVG element only has a getter for it.
  for (const element of [copy, ...copy.querySelectorAll("[class]")]) {
    element.setAttribute(
      "class",
      (element.getAttribute("class") ?? "").replace(
        /(gl-export-(?:field|icon))--(?:scalebar|pageSize)\b/g,
        `$1--${name}`,
      ),
    );
  }
  for (const label of copy.querySelectorAll("label")) label.setAttribute("for", id);
  for (const control of copy.querySelectorAll("input, select")) {
    control.setAttribute("id", id);
    control.setAttribute("name", id);
  }

  return copy;
}

/**
 * Adds the fields to an open dialog. Returns what to call to take the listeners away; the fields
 * go with the dialog.
 */
export function addHeaderFields(dialog: HTMLElement, options: HeaderFieldOptions): () => void {
  const scalebar = dialog.querySelector<HTMLElement>(".gl-export-field--scalebar");
  const pageSize = dialog.querySelector<HTMLElement>(".gl-export-field--pageSize");
  if (!scalebar || !pageSize || dialog.querySelector(".gl-export-field--mapHeader")) {
    return () => {};
  }

  counter += 1;
  const switchId = `gl-export-map-header-${counter}`;
  const selectId = `gl-export-map-header-classification-${counter}`;

  // The switch
  const toggleField = copyField(scalebar, "mapHeader", switchId);
  const toggle = toggleField.querySelector<HTMLInputElement>("input[type=checkbox]");
  const toggleText = toggleField.querySelector<HTMLElement>("label > span:not([aria-hidden])");
  const toggleIcon = toggleField.querySelector<HTMLElement>("[aria-hidden=true]");
  if (!toggle || !toggleText || !toggleIcon) return () => {};
  toggleText.textContent = options.labels.title;
  toggleIcon.innerHTML = TAG_ICON;
  toggle.checked = options.enabled;

  // The classification
  const classField = copyField(pageSize, "mapHeaderClassification", selectId);
  const select = classField.querySelector<HTMLSelectElement>("select");
  const selectText = classField.querySelector<HTMLElement>("label > span:not([aria-hidden])");
  const selectIcon = classField.querySelector<HTMLElement>("[aria-hidden=true]");
  if (!select || !selectText || !selectIcon) return () => {};
  selectText.textContent = options.labels.classification;
  selectIcon.innerHTML = TAG_ICON;
  select.replaceChildren(
    ...CLASSIFICATIONS.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = options.labels.classifications[value];
      return option;
    }),
  );
  select.value = options.classification;

  const refresh = () => {
    const available = dialogCanCarryHeader(dialog);
    toggle.disabled = !available;
    toggleField.title = available ? "" : options.labels.unavailable;
    classField.hidden = !(available && toggle.checked);
  };

  const onToggle = () => {
    options.onChange({ enabled: toggle.checked });
    refresh();
  };
  const onSelect = () => {
    const value = CLASSIFICATIONS.find((c) => c === select.value);
    if (value) options.onChange({ classification: value });
  };
  toggle.addEventListener("change", onToggle);
  select.addEventListener("change", onSelect);
  // The format, and whether the export is a vector one, decide whether a header is possible.
  dialog.addEventListener("change", refresh);

  scalebar.after(toggleField, classField);
  refresh();

  return () => dialog.removeEventListener("change", refresh);
}
