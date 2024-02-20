import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { useControl } from "react-map-gl";

import { Dispatch, memo, SetStateAction, useEffect, useState } from "react";
import type { ControlPosition } from "react-map-gl/maplibre";

type DrawControlProps = ConstructorParameters<typeof MapboxDraw>[0] & {
    position?: ControlPosition;
    setDraw: Dispatch<SetStateAction<MapboxDraw | undefined>>
    onCreate: (e: any) => void;
    onUpdate: (e: any) => void;
    onDelete: (e: any) => void;
    onCombine: (e: any) => void;
    onSelectionChange: (e: any) => void;
};

function DrawControl(props: DrawControlProps) {
    const [draw, setDraw] = useState<MapboxDraw>();
    const { setDraw: setDrawInParent } = props;

    useEffect(() => {
        setDrawInParent(draw)
    }, [draw, setDrawInParent])

    useControl<MapboxDraw>(
        ({ map }) => {

            // map.on("draw.create", (e) => console.log("onCreate:", e));
            // map.on("draw.update", (e) => console.log("onUpdate:", e));
            map.on("draw.create", (e) => props.onCreate(e));
            map.on("draw.update", (e) => props.onUpdate(e));
            map.on("draw.combine", (e) => props.onCombine(e));
            map.on("draw.uncombine", (e) => props.onCombine(e));
            map.on("draw.delete", (e) => props.onDelete(e));
            map.on("draw.selectionchange", (e) => props.onSelectionChange(e))

            let draw = new MapboxDraw(props);
            setDraw(draw);

            return draw;
        },
        ({ map }) => {
            map.off("draw.create", (e) => props.onCreate(e));
            map.off("draw.update", (e) => props.onUpdate(e));
            map.off("draw.combine", (e) => props.onCombine(e));
            map.off("draw.uncombine", (e) => props.onCombine(e));
            map.off("draw.delete", (e) => props.onDelete(e));
            map.off("draw.selectionchange", (e) => props.onSelectionChange(e))
        },
        {
            position: props.position
        }
    );

    return null;
}


DrawControl.defaultProps = {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onCreate: (e: any) => console.log("onCreate:", e),
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onUpdate: (e: any) => console.log("onCreate:", e),
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onDelete: () => { },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onCombine: () => { },
    // eslint-disable-nexexport default memo(DrawControl);t-line @typescript-eslint/no-empty-function
    onSelectionChange: () => { }
};

export default memo(DrawControl);