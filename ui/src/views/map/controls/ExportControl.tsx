import { Format, MaplibreExportControl, PageOrientation, Size } from "@watergis/maplibre-gl-export";
import '@watergis/maplibre-gl-export/dist/maplibre-gl-export.css';
import { ControlPosition, useControl } from "react-map-gl/maplibre";

export type ExportControlProps = {
    /** Placement of the control relative to the map. */
    position?: ControlPosition;
    // options: ConstructorParameters<typeof MapboxExportControl>
};

function ExportControl(props: ExportControlProps): null {
    const { position } = props;
    useControl<MaplibreExportControl>(
        ({ map }) =>
            new MaplibreExportControl({
                PageSize: Size.A3,
                PageOrientation: PageOrientation.Landscape,
                Format: Format.PDF,
                DPI: 300,
                Crosshair: false,
                PrintableArea: true,
            }),
        { position: position }
    );

    return null;
}
ExportControl.defaultProps = {
    position: 'bottom-left'
};

export default ExportControl;