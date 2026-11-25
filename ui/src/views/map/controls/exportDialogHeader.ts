import {
  CLASSIFICATIONS,
  type Classification,
  drawExportHeader,
  type ExportHeader,
  pageScale,
} from "./exportHeader";

/**
 * Puts the map header into the export dialog the way the dialog has its north icon: a switch, and
 * below it a framed group with the details. The details are the classification of the sheet, who
 * the map is made by and who keeps it; the last two are the domain of the server and the name of
 * the user until something else is typed.
 *
 * The dialog belongs to @watergis/maplibre-gl-export and has no place for fields of ours. It is
 * built from stable `gl-export-*` classes, so the fields are copies of its own: the switch of the
 * scale bar, the group and the inline rows of the north icon, the select of the page size and the
 * text field of the file name, with their own ids and listeners. If the dialog changes so that
 * what is to be copied is not found, nothing is added and the export goes on as it was.
 */

export interface HeaderChange {
  enabled?: boolean;
  classification?: Classification;
  organisation?: string;
  keeper?: string;
}

export interface HeaderFieldOptions {
  enabled: boolean;
  classification: Classification;
  /** What the user typed; empty for the automatic value. */
  organisation: string;
  keeper: string;
  /** The automatic values, shown while the fields are empty. */
  defaults: { organisation: string; keeper: string };
  labels: {
    title: string;
    classification: string;
    organisation: string;
    keeper: string;
    /** Why the switch is off for a format that cannot carry the header. */
    unavailable: string;
    classifications: Record<Classification, string>;
  };
  maxLength: number;
  onChange: (change: HeaderChange) => void;
  /** The header and the page it is for, to show on the dialog's preview of the page. */
  preview?: () => { header: ExportHeader; size: [number, number] } | undefined;
}

export interface HeaderFields {
  /** Draws the header on the preview again, e.g. when the preview itself was made again. */
  refresh: () => void;
  dispose: () => void;
}

/** The formats whose page is an image the header can be drawn on. */
const FORMATS_WITH_HEADER = new Set(["pdf", "png", "jpg", "webp"]);

const svg = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

/** Icons of Lucide, the set the dialog's own icons come from. */
const ICONS = {
  tag: svg(
    '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"></path><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"></circle>',
  ),
  building: svg(
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"></path><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"></path><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"></path><path d="M10 6h4"></path><path d="M10 10h4"></path><path d="M10 14h4"></path><path d="M10 18h4"></path>',
  ),
  user: svg(
    '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
  ),
};

/** The format and vector choice the dialog is showing: whether the page is an image. */
export function dialogCanCarryHeader(dialog: ParentNode): boolean {
  const format = dialog.querySelector<HTMLInputElement>(
    "input[type=radio][name$='-format']:checked",
  );
  const vector = dialog.querySelector<HTMLInputElement>("input[type=checkbox][id$='-vector']");

  return FORMATS_WITH_HEADER.has(format?.value ?? "") && !vector?.checked;
}

let counter = 0;

/** Renames a copied field: the modifier of its classes, its ids and what its labels point at. */
function rename(copy: HTMLElement, from: RegExp, name: string, id: string): HTMLElement {
  // setAttribute, not className: an SVG element only has a getter for it.
  for (const element of [copy, ...copy.querySelectorAll("[class]")]) {
    element.setAttribute(
      "class",
      (element.getAttribute("class") ?? "").replace(from, `$1--${name}`),
    );
  }
  for (const label of copy.querySelectorAll("label")) label.setAttribute("for", id);
  for (const control of copy.querySelectorAll("input, select")) {
    control.setAttribute("id", id);
    control.setAttribute("name", id);
  }

  return copy;
}

const FIELD_MODIFIER =
  /(gl-export-(?:field|icon))--(?:scalebar|pageSize|northIconSymbol|fileName)\b/g;

const NONE: HeaderFields = { refresh: () => {}, dispose: () => {} };

/**
 * Adds the fields to an open dialog, after the scale bar. Returns what to call to draw the preview
 * again, and to take the listeners away; the fields go with the dialog.
 */
export function addHeaderFields(dialog: HTMLElement, options: HeaderFieldOptions): HeaderFields {
  const scalebar = dialog.querySelector<HTMLElement>(".gl-export-field--scalebar");
  const pageSize = dialog.querySelector<HTMLElement>(".gl-export-field--pageSize");
  const fileName = dialog.querySelector<HTMLElement>(".gl-export-field--fileName");
  const northSymbol = dialog.querySelector<HTMLElement>(".gl-export-field--northIconSymbol");
  const northGroup = dialog.querySelector<HTMLElement>(".gl-export-field-group--northIcon");
  const textInput = fileName?.querySelector<HTMLInputElement>("input[type=text]");
  const selectSource = pageSize?.querySelector<HTMLSelectElement>("select");
  if (
    !scalebar ||
    !pageSize ||
    !northSymbol ||
    !northGroup ||
    !textInput ||
    !selectSource ||
    dialog.querySelector(".gl-export-field--mapHeader")
  ) {
    return NONE;
  }

  counter += 1;
  const id = (name: string) => `gl-export-map-header-${name}-${counter}`;

  /** A row of the group: label with its icon on the left, the control on the right. */
  const inlineField = (name: string, label: string, icon: string, control: HTMLElement) => {
    const field = rename(
      northSymbol.cloneNode(true) as HTMLElement,
      FIELD_MODIFIER,
      `mapHeader-${name}`,
      id(name),
    );
    const text = field.querySelector<HTMLElement>("label > span:not([aria-hidden])");
    const iconBox = field.querySelector<HTMLElement>("[aria-hidden=true]");
    const controlBox = field.querySelector<HTMLElement>(".gl-export-field__control");
    if (!text || !iconBox || !controlBox) return undefined;
    text.textContent = label;
    iconBox.innerHTML = icon;
    controlBox.replaceChildren(control);
    control.id = id(name);

    return field;
  };

  // The switch, a copy of the one of the scale bar.
  const toggleField = rename(
    scalebar.cloneNode(true) as HTMLElement,
    FIELD_MODIFIER,
    "mapHeader",
    id("switch"),
  );
  const toggle = toggleField.querySelector<HTMLInputElement>("input[type=checkbox]");
  const toggleText = toggleField.querySelector<HTMLElement>("label > span:not([aria-hidden])");
  const toggleIcon = toggleField.querySelector<HTMLElement>("[aria-hidden=true]");
  if (!toggle || !toggleText || !toggleIcon) return NONE;
  toggleText.textContent = options.labels.title;
  toggleIcon.innerHTML = ICONS.tag;
  toggle.checked = options.enabled;

  // The details, in a group like the one of the north icon.
  const group = rename(
    northGroup.cloneNode(false) as HTMLElement,
    /(gl-export-field-group)--northIcon\b/g,
    "mapHeader",
    id("group"),
  );

  const select = selectSource.cloneNode(false) as HTMLSelectElement;
  select.replaceChildren(
    ...CLASSIFICATIONS.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = options.labels.classifications[value];
      return option;
    }),
  );
  select.value = options.classification;
  select.removeAttribute("name");

  const textField = (value: string, placeholder: string) => {
    const input = textInput.cloneNode(false) as HTMLInputElement;
    input.removeAttribute("name");
    input.value = value;
    input.placeholder = placeholder;
    input.maxLength = options.maxLength;
    input.style.minWidth = "0";

    return input;
  };
  const organisation = textField(options.organisation, options.defaults.organisation);
  const keeper = textField(options.keeper, options.defaults.keeper);

  const rows = [
    inlineField("classification", options.labels.classification, ICONS.tag, select),
    inlineField("organisation", options.labels.organisation, ICONS.building, organisation),
    inlineField("keeper", options.labels.keeper, ICONS.user, keeper),
  ];
  if (rows.some((row) => row === undefined)) return NONE;
  group.replaceChildren(...(rows as HTMLElement[]));

  // The header on the preview of the page, a canvas laid over it: like the scale bar and the
  // north icon, it is in the preview as it will be in the file. The page is made after the dialog
  // opens, so the canvas is put over it when it is there.
  const overlay = document.createElement("canvas");
  overlay.className = "gl-export-header-preview";
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
  let observer: MutationObserver | undefined;

  const drawPreview = () => {
    const frame = dialog.querySelector<HTMLElement>(".gl-export-dialog__page");
    const pageCanvas = dialog.querySelector<HTMLCanvasElement>(".gl-export-dialog__canvas");
    if (!frame || !pageCanvas) return;

    if (overlay.parentElement !== frame) {
      if (getComputedStyle(frame).position === "static") frame.style.position = "relative";
      frame.append(overlay);
      // The page may be sized again (another page size or orientation): the overlay follows.
      observer?.disconnect();
      observer = new MutationObserver(drawPreview);
      observer.observe(pageCanvas, { attributes: true, attributeFilter: ["width", "height"] });
    }

    overlay.width = pageCanvas.width;
    overlay.height = pageCanvas.height;
    overlay.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);

    const shown = toggle.checked && dialogCanCarryHeader(dialog);
    const preview = shown ? options.preview?.() : undefined;
    if (!preview) return;

    drawExportHeader(
      overlay,
      {
        ...preview.header,
        classification: select.value as Classification,
        organisation: organisation.value.trim() || options.defaults.organisation,
        keeper: keeper.value.trim() || options.defaults.keeper,
      },
      pageScale(overlay.width, preview.size[0]),
    );
  };

  const refresh = () => {
    const available = dialogCanCarryHeader(dialog);
    toggle.disabled = !available;
    toggleField.title = available ? "" : options.labels.unavailable;
    group.hidden = !(available && toggle.checked);
    // the group is laid out by the dialog's own styles, which would show it whatever `hidden` says
    group.style.display = group.hidden ? "none" : "";
    drawPreview();
  };

  const onToggle = () => {
    options.onChange({ enabled: toggle.checked });
    refresh();
  };
  const onSelect = () => {
    const value = CLASSIFICATIONS.find((c) => c === select.value);
    if (value) options.onChange({ classification: value });
    drawPreview();
  };
  const onOrganisation = () => {
    options.onChange({ organisation: organisation.value.trim() });
    drawPreview();
  };
  const onKeeper = () => {
    options.onChange({ keeper: keeper.value.trim() });
    drawPreview();
  };
  toggle.addEventListener("change", onToggle);
  select.addEventListener("change", onSelect);
  organisation.addEventListener("input", onOrganisation);
  keeper.addEventListener("input", onKeeper);
  // The format, and whether the export is a vector one, decide whether a header is possible.
  dialog.addEventListener("change", refresh);

  scalebar.after(toggleField, group);
  refresh();

  // The page is made a little after the dialog opens: when it appears, the header goes over it.
  const appearing = new MutationObserver(() => {
    const frame = dialog.querySelector(".gl-export-dialog__page");
    if (frame && overlay.parentElement !== frame) drawPreview();
  });
  appearing.observe(dialog, { childList: true, subtree: true });

  return {
    refresh: drawPreview,
    dispose: () => {
      dialog.removeEventListener("change", refresh);
      observer?.disconnect();
      appearing.disconnect();
      overlay.remove();
    },
  };
}
