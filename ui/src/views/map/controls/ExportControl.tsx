import { Format, MapboxExportControl, PageOrientation, Size } from "@watergis/mapbox-gl-export";
import '@watergis/mapbox-gl-export/css/styles.css';
import { ControlPosition, useControl } from "react-map-gl";

export type ExportControlProps = {
    /** Placement of the control relative to the map. */
    position?: ControlPosition;
    // options: ConstructorParameters<typeof MapboxExportControl>
};

function ExportControl(props: ExportControlProps): null {
    const { position } = props;
    useControl<MapboxExportControl>(
        ({ map }) =>
            new MapboxExportControl({
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