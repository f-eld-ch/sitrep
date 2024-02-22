import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { useControl } from "react-map-gl";
import { memo, useContext, useState } from "react";
import { type ControlPosition } from "react-map-gl/maplibre";
import { LayerContext } from "../LayerContext";
import { FeatureEvent, CombineFeatureEvent } from "../Map";

type DrawControlProps = ConstructorParameters<typeof MapboxDraw>[0] & {
    position?: ControlPosition;
    onCreate: (e: FeatureEvent) => void
    onUpdate: (e: FeatureEvent) => void
    onDelete: (e: FeatureEvent) => void
    onCombine: (e: CombineFeatureEvent) => void
    onSelectionChange: (e: FeatureEvent) => void
};

function DrawControl(props: DrawControlProps) {
    const { dispatch } = useContext(LayerContext);
    const [draw, setDraw] = useState<MapboxDraw>();

    const {
        onCreate,
        onDelete,
        onUpdate,
        onSelectionChange,
        onCombine,
    } = props;

    useControl<MapboxDraw>(
        ({ map }) => {
            let d = new MapboxDraw(props);
            setDraw(d);

            map.on("draw.create", (e) => { onCreate(e) });
            map.on("draw.update", (e) => { onUpdate(e) });
            map.on("draw.combine", (e) => { onCombine(e) });
            map.on("draw.uncombine", (e) => { onCombine(e) });
            map.on("draw.delete", (e) => { onDelete(e) });
            map.on("draw.selectionchange", (e) => { onSelectionChange(e) });
            return d;
        },
        () => {
            if (draw) {
                dispatch({ type: "SET_DRAW", payload: { draw: draw } })
            }
        },
        ({ map }) => {
            map.off("draw.create", (e) => onCreate(e));
            map.off("draw.update", (e) => onUpdate(e));
            map.off("draw.combine", (e) => onCombine(e));
            map.off("draw.uncombine", (e) => onCombine(e));
            map.off("draw.delete", (e) => onDelete(e));
            map.off("draw.selectionchange", (e) => onSelectionChange(e))
            dispatch({ type: "SET_DRAW", payload: { draw: undefined } })
        },
        {
            position: props.position
        }
    );

    return null;
}
export default memo(DrawControl);