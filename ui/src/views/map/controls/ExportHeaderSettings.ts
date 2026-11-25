import { useLocalStorage } from "usehooks-ts";
import { CLASSIFICATIONS, type Classification } from "./exportHeader";

export interface ExportHeaderSettings {
  /** Put the header on the exported map. */
  enabled: boolean;
  classification: Classification;
  /** Who the map is made by; empty for the domain of the server. */
  organisation: string;
  /** Who keeps the map; empty for the name of the user. */
  keeper: string;
}

const STORAGE_KEY = "sitrep.exportHeader";
const DEFAULTS: ExportHeaderSettings = {
  enabled: true,
  classification: "intern",
  organisation: "",
  keeper: "",
};

/** The longest text a field of the header takes: a line of the table must stay a line. */
export const MAX_HEADER_TEXT = 80;

const isClassification = (value: unknown): value is Classification =>
  (CLASSIFICATIONS as readonly unknown[]).includes(value);

const text = (value: unknown): string =>
  typeof value === "string" ? value.slice(0, MAX_HEADER_TEXT) : "";

/** The settings of the header, kept in the browser; anything unreadable is the default. */
export function useExportHeaderSettings(): [
  ExportHeaderSettings,
  (settings: Partial<ExportHeaderSettings>) => void,
] {
  const [stored, setStored] = useLocalStorage<unknown>(STORAGE_KEY, DEFAULTS);
  const record = (stored ?? {}) as Partial<Record<keyof ExportHeaderSettings, unknown>>;
  const settings: ExportHeaderSettings = {
    enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULTS.enabled,
    classification: isClassification(record.classification)
      ? record.classification
      : DEFAULTS.classification,
    organisation: text(record.organisation),
    keeper: text(record.keeper),
  };

  return [settings, (change) => setStored({ ...settings, ...change })];
}
