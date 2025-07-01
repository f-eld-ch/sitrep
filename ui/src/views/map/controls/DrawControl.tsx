import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  type ControlPosition,
  useControl,
  useMap,
} from "react-map-gl/maplibre";
import { LayerContext } from "../LayerContext";
import type { CombineFeatureEvent, FeatureEvent } from "../Map";

type DrawControlProps = ConstructorParameters<typeof MapboxDraw>[0] & {
  position?: ControlPosition;
  onCreate: (e: FeatureEvent, layer: string) => void;
  onUpdate: (e: FeatureEvent) => void;
  onDelete: (e: FeatureEvent) => void;
  onCombine: (e: CombineFeatureEvent) => void;
  onSelectionChange: (e: FeatureEvent) => void;
  activeLayer: string;
};

function DrawControl(props: DrawControlProps) {
  const { dispatch } = useContext(LayerContext);
  const [draw, setDraw] = useState<MapboxDraw>();

  const { current: map } = useMap();

  const {
    activeLayer,
    onCreate,
    onDelete,
    onUpdate,
    onSelectionChange,
    onCombine,
  } = props;

  const create = useCallback(
    (e: FeatureEvent) => {
      onCreate(e, activeLayer);
    },
    [onCreate, activeLayer],
  );

  const refCreate = useRef(create);

  useEffect(() => {
    map?.off("draw.create", refCreate.current);
    map?.on("draw.create", create);
    map?.triggerRepaint();
    refCreate.current = create;
  }, [create, map]);

  // @ts-expect-error - Map$1 issue in definitivelyTyped: https://github.com/DefinitelyTyped/DefinitelyTyped/pull/70497
  useControl<MapboxDraw>(
    () => {
      const d = new MapboxDraw(props);
      setDraw(d);
      return d;
    },
    ({ map }) => {
      if (draw) {
        map.on("draw.update", onUpdate);
        map.on("draw.delete", onDelete);
        map.on("draw.combine", onCombine);
        map.on("draw.uncombine", onCombine);
        map.on("draw.create", create);
        map.on("draw.selectionchange", onSelectionChange);
        dispatch({ type: "SET_DRAW", payload: { draw: draw } });
      }
    },
    ({ map }) => {
      map.off("draw.create", refCreate.current);
      map.off("draw.update", onUpdate);
      map.off("draw.delete", onDelete);
      map.off("draw.combine", onCombine);
      map.off("draw.uncombine", onCombine);
      map.off("draw.selectionchange", onSelectionChange);
      dispatch({ type: "SET_DRAW", payload: { draw: undefined } });
    },
    {
      position: props.position,
    },
  );

  return null;
}
export default DrawControl;
