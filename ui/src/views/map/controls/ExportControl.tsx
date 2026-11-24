import {
  Format,
  type Language,
  MaplibreExportControl,
  type MapView,
  PageOrientation,
  Size,
} from "@watergis/maplibre-gl-export";
import "@watergis/maplibre-gl-export/dist/maplibre-gl-export.css";
import i18next from "i18next";
import { jsPDF } from "jspdf";
import { useContext, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type ControlPosition, useControl } from "react-map-gl/maplibre";
import { IncidentContext, UserContext } from "utils";
import { LayerContext } from "../LayerContext";
import { MapTimeContext } from "../MapTimeContext";
import {
  drawExportHeader,
  type ExportHeader,
  type ExportHeaderText,
  scaleDenominator,
} from "./exportHeader";
import { addHeaderFields, type HeaderFieldOptions } from "./exportDialogHeader";
import { useExportHeaderSettings } from "./ExportHeaderSettings";

export interface ExportControlProps {
  /** Placement of the control relative to the map. */
  position?: ControlPosition;
  // options: ConstructorParameters<typeof MapboxExportControl>
}

function getLanguage(): Language {
  switch (i18next.language) {
    case "de":
      return "de";
    case "fr":
      return "fr";

    default:
      return "en";
  }
}

const FILE_NAME_PREFIX = "sitrep-map";

/**
 * The name the export is offered under: `sitrep-map-<incident name>`, without anything a file
 * name cannot hold, and without the extension, which the format adds.
 */
export function exportFileName(incidentName: string | undefined): string {
  const name = (incidentName ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);

  return name === "" ? FILE_NAME_PREFIX : `${FILE_NAME_PREFIX}-${name}`;
}

/** What the dialog hands over for an export; the part the header needs. */
interface ExportSettingsLike {
  size: [number, number];
  dpi: number;
  format: string;
  fileName: string;
  vector: boolean;
  view: MapView;
  fileHandle?: FileSystemFileHandle;
}

/**
 * Whether the page can carry the header. It is drawn on the image of the page, so a vector
 * export, SVG and GeoTIFF, which are written by the library from something else, go without.
 */
export const canHaveHeader = (settings: Pick<ExportSettingsLike, "format" | "vector">): boolean =>
  !settings.vector && ["pdf", "png", "jpg", "webp"].includes(settings.format);

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

/** The page as the file to write: an image, or a PDF page holding it. */
async function encodePage(
  canvas: HTMLCanvasElement,
  settings: Pick<ExportSettingsLike, "format" | "size">,
): Promise<{ blob: Blob; extension: string }> {
  if (settings.format === "pdf") {
    const [width, height] = settings.size;
    const pdf = new jsPDF({
      orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
      unit: "mm",
      format: [Math.min(width, height), Math.max(width, height)],
      compress: true,
    });
    pdf.addImage(
      canvas,
      "PNG",
      0,
      0,
      pdf.internal.pageSize.getWidth(),
      pdf.internal.pageSize.getHeight(),
    );

    return { blob: pdf.output("blob"), extension: "pdf" };
  }

  const type = IMAGE_TYPES[settings.format] ?? "image/png";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  if (!blob) throw new Error("The page could not be turned into an image");

  // A browser that cannot write a type gives a PNG instead.
  return {
    blob,
    extension: blob.type === "image/jpeg" ? "jpg" : (blob.type.split("/")[1] ?? "png"),
  };
}

/** Hands the file over: to the file chosen in the save dialog, or as a download. */
async function saveFile(
  blob: Blob,
  fileName: string,
  handle?: FileSystemFileHandle,
): Promise<void> {
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();

    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The export control, offering the incident's name as the name of the file, and putting the header
 * on the page when there is one.
 */
export class SitrepExportControl extends MaplibreExportControl {
  private offered = "";
  private makeHeader: ((view: MapView) => ExportHeader | undefined) | undefined;
  private headerFields: (() => HeaderFieldOptions) | undefined;

  /** Where the header of an export comes from (a view of the map to a header, or none). */
  setHeaderSource(
    makeHeader: (view: MapView) => ExportHeader | undefined,
    headerFields: () => HeaderFieldOptions,
  ): void {
    this.makeHeader = makeHeader;
    this.headerFields = headerFields;
  }

  openDialog(): void {
    super.openDialog();

    // The dialog is in the page as soon as it is opened; if not yet, a frame later.
    const add = () => {
      const dialog = document.querySelector<HTMLElement>(".gl-export-dialog");
      if (dialog && this.headerFields) addHeaderFields(dialog, this.headerFields());

      return dialog !== null;
    };
    if (!add()) requestAnimationFrame(add);
  }

  protected async exportMap(
    map: Parameters<MaplibreExportControl["onAdd"]>[0],
    settings: ExportSettingsLike,
  ): Promise<boolean> {
    const header = canHaveHeader(settings) ? this.makeHeader?.(settings.view) : undefined;
    // Nothing of its own to add: the library does what it always did.
    if (!header) return super.exportMap(map, settings as never);

    try {
      // The page as an image, whatever the format, which the header is then drawn on.
      const config = this.createGeneratorConfig(settings as never);
      const canvas = await this.createGenerator(map, { ...config, format: Format.PNG }).toCanvas();
      await document.fonts?.load?.("12px B612");
      drawExportHeader(canvas, header, settings.dpi);

      const { blob, extension } = await encodePage(canvas, settings);
      const base = settings.fileName.replace(/\.[A-Za-z0-9]{2,4}$/, "");
      await saveFile(blob, `${base}.${extension}`, settings.fileHandle);

      return true;
    } catch (error) {
      console.error("Failed to export the map:", error);

      return false;
    }
  }

  /**
   * What the file is called unless the user types another name: it follows the incident while the
   * dialog's name is still the one offered before.
   */
  offerFileName(name: string): void {
    if (this.dialogState && this.dialogState.fileName === this.offered) {
      this.dialogState.fileName = name;
    }
    this.options.Filename = name;
    this.offered = name;
  }
}

function ExportControl(props: ExportControlProps): null {
  const { position } = props;
  const { t } = useTranslation();
  const { state } = useContext(IncidentContext);
  const { state: user } = useContext(UserContext);
  const { state: layers } = useContext(LayerContext);
  const { asOf } = useContext(MapTimeContext);
  const [settings, setSettings] = useExportHeaderSettings();
  const control = useControl<SitrepExportControl>(
    () =>
      new SitrepExportControl({
        Filename: exportFileName(undefined),
        PageSize: Size.A3,
        PageOrientation: PageOrientation.Landscape,
        Format: Format.PDF,
        DPI: 300,
        Local: getLanguage(),
        // The attribution is taken from the map's own control, which already carries the
        // swisstopo text, and is drawn bottom right.
        attributionOptions: {
          visibility: "visible",
          position: "bottom-right",
        },
      }),
    { position: position },
  );

  const incidentName = state.incident?.name;
  useEffect(() => {
    control.offerFileName(exportFileName(incidentName));
  }, [control, incidentName]);

  // The header is made when the export is, from what the map shows then: the control lives on
  // and reads the latest through this.
  const latest = useRef<(view: MapView) => ExportHeader | undefined>(() => undefined);
  useEffect(() => {
    latest.current = (view) => {
      if (!settings.enabled) return undefined;

      const active = layers.layers.find((l) => l.layer.id === layers.activeLayer)?.layer;
      const messageMap = active?.kind === "MESSAGE_MAP";
      const text: ExportHeaderText = {
        classification: {
          intern: t("exportHeader.classifications.intern"),
          vertraulich: t("exportHeader.classifications.vertraulich"),
          geheim: t("exportHeader.classifications.geheim"),
        },
        mapType: t(messageMap ? "exportHeader.messageMap" : "exportHeader.commandMap"),
        baseMap: t("exportHeader.baseMap"),
        state: t("exportHeader.state"),
        keeper: t("exportHeader.keeper"),
      };

      return {
        classification: settings.classification,
        organisation: window.location.hostname,
        eventName: incidentName ?? "",
        // The layer's name is the title of a Führungskarte; the Nachrichtenkarte has no other.
        mapTitle: !messageMap ? active?.name : undefined,
        scale: scaleDenominator(view),
        state: asOf ?? new Date(),
        keeper: user.name || user.username,
        text,
      };
    };
  });
  // The switch and the classification in the export dialog.
  const fields = useRef<() => HeaderFieldOptions>(() => {
    throw new Error("not set");
  });
  useEffect(() => {
    fields.current = () => ({
      enabled: settings.enabled,
      classification: settings.classification,
      labels: {
        title: t("exportHeader.title"),
        classification: t("exportHeader.classification"),
        unavailable: t("exportHeader.unavailable"),
        classifications: {
          intern: t("exportHeader.classifications.intern"),
          vertraulich: t("exportHeader.classifications.vertraulich"),
          geheim: t("exportHeader.classifications.geheim"),
        },
      },
      onChange: setSettings,
    });
  });
  useEffect(() => {
    control.setHeaderSource(
      (view) => latest.current(view),
      () => fields.current(),
    );
  }, [control]);

  return null;
}

export default ExportControl;
