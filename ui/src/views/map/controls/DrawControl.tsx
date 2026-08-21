import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { useContext, useEffect, useMemo, useRef } from "react";
import { type ControlPosition, useControl } from "react-map-gl/maplibre";
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

/**
 * `draw.*` events are emitted by mapbox-gl-draw, so they are absent from MapLibre's
 * `MapEventType`. Casting in one place keeps the rest of the file honest instead of
 * scattering `@ts-expect-error` over every bind.
 */
type DrawEvent =
  | "draw.create"
  | "draw.update"
  | "draw.delete"
  | "draw.combine"
  | "draw.uncombine"
  | "draw.selectionchange";

interface DrawEventTarget {
  on: (event: string, listener: (e: never) => void) => unknown;
  off: (event: string, listener: (e: never) => void) => unknown;
}

const bindDrawEvents = (
  map: unknown,
  mode: "on" | "off",
  listeners: ReadonlyArray<[DrawEvent, (e: never) => void]>,
) => {
  const target = map as DrawEventTarget;
  for (const [event, listener] of listeners) target[mode](event, listener);
};

function DrawControl(props: DrawControlProps) {
  const { dispatch } = useContext(LayerContext);
  const { activeLayer, onCreate, onDelete, onUpdate, onSelectionChange, onCombine } = props;

  /**
   * `useControl` binds its handlers exactly once (its effect has an empty dep array), so
   * binding the props directly would freeze the first render's closures — which is why
   * `draw.create` used to be re-bound by a separate effect on every change, at the risk
   * of being bound twice. Routing every handler through a ref means the bindings can stay
   * stable while still calling the current callbacks.
   */
  const latest = useRef({
    activeLayer,
    onCreate,
    onDelete,
    onUpdate,
    onSelectionChange,
    onCombine,
  });
  latest.current = { activeLayer, onCreate, onDelete, onUpdate, onSelectionChange, onCombine };

  const listeners = useMemo<ReadonlyArray<[DrawEvent, (e: never) => void]>>(
    () => [
      ["draw.create", (e: never) => latest.current.onCreate(e, latest.current.activeLayer)],
      ["draw.update", (e: never) => latest.current.onUpdate(e)],
      ["draw.delete", (e: never) => latest.current.onDelete(e)],
      ["draw.combine", (e: never) => latest.current.onCombine(e)],
      ["draw.uncombine", (e: never) => latest.current.onCombine(e)],
      ["draw.selectionchange", (e: never) => latest.current.onSelectionChange(e)],
    ],
    [],
  );

  /**
   * The factory must be side-effect free.
   *
   * `useControl` creates the control inside `useMemo`, which React StrictMode
   * double-invokes — so calling `setState` in here built two MapboxDraw instances and
   * could publish the one `useControl` discarded. That instance was never added to the
   * map, so it has no internal store, and every later call failed with
   * "Cannot read properties of undefined". Take the instance from the return value
   * instead: that is the one actually attached to the map.
   */
  // @ts-expect-error - Map$1 issue in definitivelyTyped: https://github.com/DefinitelyTyped/DefinitelyTyped/pull/70497
  const draw = useControl<MapboxDraw>(
    () => new MapboxDraw(props),
    ({ map }) => bindDrawEvents(map, "on", listeners),
    ({ map }) => bindDrawEvents(map, "off", listeners),
    { position: props.position },
  );

  /**
   * Publish the control for the rest of the map to use, and retract it on unmount so no
   * consumer keeps a reference to a control that has been removed from the map.
   */
  useEffect(() => {
    if (!draw) return;
    dispatch({ type: "SET_DRAW", payload: { draw } });
    return () => {
      dispatch({ type: "SET_DRAW", payload: { draw: undefined } });
    };
  }, [draw, dispatch]);

  return null;
}
export default DrawControl;
