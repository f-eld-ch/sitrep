import { useLocalStorage } from "usehooks-ts";
import { CLASSIFICATIONS, type Classification } from "./exportHeader";

export interface ExportHeaderSettings {
  /** Put the header on the exported map. */
  enabled: boolean;
  classification: Classification;
}

const STORAGE_KEY = "sitrep.exportHeader";
const DEFAULTS: ExportHeaderSettings = { enabled: true, classification: "intern" };

const isClassification = (value: unknown): value is Classification =>
  (CLASSIFICATIONS as readonly unknown[]).includes(value);

/** The settings of the header, kept in the browser; anything unreadable is the default. */
export function useExportHeaderSettings(): [
  ExportHeaderSettings,
  (settings: Partial<ExportHeaderSettings>) => void,
] {
  const [stored, setStored] = useLocalStorage<unknown>(STORAGE_KEY, DEFAULTS);
  const record = (stored ?? {}) as Partial<ExportHeaderSettings>;
  const settings: ExportHeaderSettings = {
    enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULTS.enabled,
    classification: isClassification(record.classification)
      ? record.classification
      : DEFAULTS.classification,
  };

  return [settings, (change) => setStored({ ...settings, ...change })];
}
