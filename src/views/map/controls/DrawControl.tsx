import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { useControl } from "react-map-gl";

import { Dispatch, memo, SetStateAction, useEffect, useState } from "react";
import type { ControlPosition } from "react-map-gl/maplibre";

type DrawControlProps = ConstructorParameters<typeof MapboxDraw>[0] & {
    position?: ControlPosition;
    setDraw: Dispatch<SetStateAction<MapboxDraw | undefined>>
    onCreate: (evt: any) => void;
    onUpdate: (evt: any) => void;
    onDelete: (evt: any) => void;
    onCombine: (evt: any) => void;
    onSelectionChange: (evt: any) => void;
};

function DrawControl(props: DrawControlProps) {
    const [draw, setDraw] = useState<MapboxDraw>();
    const { setDraw: setDrawInParent } = props;

    useEffect(() => {
        if (draw) setDrawInParent(draw)
    }, [draw, setDrawInParent])

    useControl<MapboxDraw>(
        ({ map }) => {
            map.on("draw.create", props.onCreate);
            map.on("draw.update", props.onUpdate);
            map.on("draw.combine", props.onCombine);
            map.on("draw.uncombine", props.onCombine);
            map.on("draw.delete", props.onDelete);
            map.on("draw.selectionchange", props.onSelectionChange)

            const draw = new MapboxDraw(props);
            setDraw(draw);

            return draw;
        },
        ({ map }) => {
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
    onCombine: () => { },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onSelectionChange: () => { }
};

export default memo(DrawControl);