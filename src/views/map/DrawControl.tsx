import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { useControl } from "react-map-gl";

import { Feature } from 'geojson';
import { memo } from "react";
import type { ControlPosition, MapRef } from "react-map-gl";

type DrawControlProps = ConstructorParameters<typeof MapboxDraw>[0] & {
    position?: ControlPosition;
    initialFeatures?: Record<string, Feature> | undefined;

    onCreate: (evt: any) => void;
    onUpdate: (evt: any) => void;
    onDelete: (evt: any) => void;
    onCombine: (evt: any) => void;
};

function DrawControl(props: DrawControlProps) {
    useControl<MapboxDraw>(
        ({ map }: { map: MapRef }) => {
            map.on("draw.create", props.onCreate);
            map.on("draw.update", props.onUpdate);
            map.on("draw.combine", props.onCombine);
            map.on("draw.uncombine", props.onCombine);
            map.on("draw.delete", props.onDelete);

            const draw = new MapboxDraw(props);
            // props.initialFeatures && Object.values(props.initialFeatures).forEach(element => {
            //     element && draw.add(element);
            // });

            return draw;
        },
        ({ map }: { map: MapRef }) => {

            map.removeImage("KFO")
            map.off("draw.create", props.onCreate);
            map.off("draw.update", props.onUpdate);
            map.off("draw.combine", props.onCombine);
            map.off("draw.uncombine", props.onCombine);
            map.off("draw.delete", props.onDelete);
        },
        {
            position: props.position
        }
    );

    return null;
}

DrawControl.defaultProps = {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onCreate: () => { },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onUpdate: () => { },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onDelete: () => { },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onCombine: () => { }
};

export default memo(DrawControl);