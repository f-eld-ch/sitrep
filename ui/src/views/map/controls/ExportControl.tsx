import { Language, Format, MaplibreExportControl, PageOrientation, Size } from "@watergis/maplibre-gl-export";
import "@watergis/maplibre-gl-export/dist/maplibre-gl-export.css";
import i18next from "i18next";
import { ControlPosition, useControl } from "react-map-gl/maplibre";

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
        Crosshair: false,
        PrintableArea: true,
        Local: getLanguage(),
        attributionOptions: {
          style: {
            textSize: 16,
            textHaloColor: "#FFFFFF",
            textHaloWidth: 0.8,
            textColor: "#000000",
            fallbackTextFont: ["B612 Mono"],
          },
          visibility: "visible",
          position: "bottom-right",
        },
      }),
    { position: position },
  );

  return null;
}

export default ExportControl;
