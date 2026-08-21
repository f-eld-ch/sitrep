/**
 * Typed access to the `draw.*` events.
 *
 * These are emitted by `@mapbox/mapbox-gl-draw`, not by MapLibre, so they are absent from
 * MapLibre's `MapEventType` and every `on`/`off`/`fire` call for them is a type error.
 * Confining the cast to this module keeps the call sites readable and means there is one
 * place to fix if the upstream typings ever gain them.
 */

export type DrawEvent =
  | "draw.create"
  | "draw.update"
  | "draw.delete"
  | "draw.combine"
  | "draw.uncombine"
  | "draw.selectionchange";

export type DrawEventListener = (e: never) => void;

/**
 * The subset of the map we use for draw events.
 *
 * Deliberately structural and narrow rather than `Map`: it documents exactly what is
 * needed, and avoids re-stating MapLibre's own overloads just to widen one enum.
 */
interface DrawEventTarget {
  on: (event: string, listener: DrawEventListener) => unknown;
  off: (event: string, listener: DrawEventListener) => unknown;
  fire: (event: string, properties?: unknown) => unknown;
}

const asDrawTarget = (map: unknown): DrawEventTarget => map as DrawEventTarget;

/** Attaches or detaches several draw-event listeners in one go. */
export const bindDrawEvents = (
  map: unknown,
  mode: "on" | "off",
  listeners: ReadonlyArray<[DrawEvent, DrawEventListener]>,
): void => {
  const target = asDrawTarget(map);
  for (const [event, listener] of listeners) target[mode](event, listener);
};

/**
 * Emits a draw event on the map.
 *
 * Used to feed edits made outside the draw control — icon, line and zone changes from the
 * feature controls — back through the same `draw.update` path the control itself uses, so
 * there is a single persistence route.
 */
export const fireDrawEvent = (map: unknown, event: DrawEvent, properties?: unknown): void => {
  asDrawTarget(map).fire(event, properties);
};
