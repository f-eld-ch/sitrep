import {
  Format,
  type Language,
  MaplibreExportControl,
  PageOrientation,
  Size,
} from "@watergis/maplibre-gl-export";
import "@watergis/maplibre-gl-export/dist/maplibre-gl-export.css";
import i18next from "i18next";
import { useContext, useEffect } from "react";
import { type ControlPosition, useControl } from "react-map-gl/maplibre";
import { IncidentContext } from "utils";

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

/** The export control, offering the incident's name as the name of the file. */
class SitrepExportControl extends MaplibreExportControl {
  private offered = "";

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
  const { state } = useContext(IncidentContext);
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

  return null;
}

export default ExportControl;
