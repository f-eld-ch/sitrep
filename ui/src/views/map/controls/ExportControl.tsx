import {
  Format,
  type Language,
  MaplibreExportControl,
  PageOrientation,
  Size,
} from "@watergis/maplibre-gl-export";
import "@watergis/maplibre-gl-export/dist/maplibre-gl-export.css";
import i18next from "i18next";
import { type ControlPosition, useControl } from "react-map-gl/maplibre";

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

function ExportControl(props: ExportControlProps): null {
  const { position } = props;
  useControl<MaplibreExportControl>(
    () =>
      new MaplibreExportControl({
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

  return null;
}

export default ExportControl;
