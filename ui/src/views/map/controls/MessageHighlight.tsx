import { faBullseye, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { ExpressionSpecification, IControl, MapMouseEvent } from "maplibre-gl";
import bbox from "@turf/bbox";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Layer as MapLayer, Popup, Source, useControl, useMap } from "react-map-gl/maplibre";
import { createPortal } from "react-dom";
import { useParams } from "react-router";
import {
  convertFeatureToGeoJsonFeature,
  layerToFeatureCollection,
  useMessageFeatureHalos,
  withLocalRemovals,
  useRestoreFeature,
} from "api";
import { Button } from "components/ui";
import { LayerContext } from "../LayerContext";
import { LINE_WIDTH, POINT_RADIUS } from "./haloStyle";
import { MapSelectionContext } from "../MapSelectionContext";
import { MapTimeContext } from "../MapTimeContext";

const SOURCE_ID = "message-highlight";

/** Not closer than this when bringing a message's features into view: a lone icon keeps its surroundings. */
const FOCUS_MAX_ZOOM = 16;

/** Green for what the message put on the map, light blue for what it changed, light red for what it removed. */
const HALO_COLOR = [
  "match",
  ["get", "halo"],
  "added",
  "#22c55e",
  "removed",
  "#f87171",
  "#7dd3fc",
] as unknown as ExpressionSpecification;

/**
 * A virtual layer of its own: only what was done for the message being worked on, picked out
 * with a halo on top of everything else, which stays visible. Nothing is stored for it; it is
 * derived from the feature history. A removed feature is no longer on the map, so its halo
 * marks where it last was.
 */
export function MessageHighlight({
  enabled,
  renderRemoved,
}: {
  enabled: boolean;
  /** Draws the removed features as they last looked, so they can be seen at all. */
  renderRemoved: (features: FeatureCollection) => ReactNode;
}) {
  const { incidentId } = useParams();
  const { state, dispatch } = useContext(LayerContext);
  const { drawingMessage } = useContext(MapTimeContext);
  const layer = state.layers.find((l) => l.layer.kind === "MESSAGE_MAP")?.layer;
  // Changes whenever a feature is drawn, modified or removed, which is when the history is re-read.
  const refreshKey = JSON.stringify(layer?.features ?? []);
  const { halos, ready } = useMessageFeatureHalos(incidentId, drawingMessage?.id, refreshKey);
  const { current: map } = useMap();
  const { asOf } = useContext(MapTimeContext);
  const { onDrawingChange } = useContext(MapSelectionContext);
  const { t } = useTranslation();
  const [restoreFeature, restoreState] = useRestoreFeature();
  // The removed feature the user clicked, to offer bringing it back.
  const [target, setTarget] = useState<{ id: string; lng: number; lat: number } | undefined>();
  // Features being brought back: their ghost goes at once, before the history says so.
  const [restoring, setRestoring] = useState<ReadonlySet<string>>(new Set());
  const canRestore = enabled && drawingMessage !== undefined && !drawingMessage.locked;

  useEffect(() => {
    if (map === undefined || !canRestore) return;

    const layerIds = [`${SOURCE_ID}-point`, `${SOURCE_ID}-line-removed`, `${SOURCE_ID}-fill`];
    const onClick = (e: MapMouseEvent) => {
      const present = layerIds.filter((id) => map.getLayer(id));
      const hit = map
        .queryRenderedFeatures(e.point, { layers: present })
        .find((f) => f.properties?.halo === "removed");
      const id = hit?.properties?.featureId;

      setTarget(typeof id === "string" ? { id, lng: e.lngLat.lng, lat: e.lngLat.lat } : undefined);
    };
    map.on("click", onClick);

    return () => {
      map.off("click", onClick);
    };
  }, [map, canRestore]);

  // Features this message put on the map: deleting one of them leaves nothing to show.
  const [placedHere, setPlacedHere] = useState<ReadonlySet<string>>(new Set());
  // Once the history no longer lists a feature as removed, it needs no marker of its own.
  const [seenHalos, setSeenHalos] = useState(halos);
  if (halos !== seenHalos) {
    setSeenHalos(halos);
    const added = [...halos].filter(([, h]) => h.kind === "added").map(([id]) => id);
    if (added.some((id) => !placedHere.has(id))) setPlacedHere(new Set([...placedHere, ...added]));
    setRestoring((ids) => {
      const open = new Set([...ids].filter((id) => halos.get(id)?.kind === "removed"));

      return open.size === ids.size ? ids : open;
    });
  }

  const restore = () => {
    if (!target || !layer || !drawingMessage) return;

    // Also a feature deleted a moment ago, which the history does not list yet.
    const ghost = withLocalRemovals(
      halos,
      state.removedFeatures,
      drawingMessage.id,
      placedHere,
    ).get(target.id);
    if (!ghost) return;

    const { id } = target;
    dispatch({ type: "CLEAR_REMOVED_FEATURE", payload: { id } });
    setRestoring((ids) => new Set(ids).add(id));
    setTarget(undefined);
    onDrawingChange?.();

    void restoreFeature({
      id,
      layerId: layer.id,
      incidentId: incidentId ?? "",
      current: { geometry: ghost.lastGeometry, properties: ghost.lastProperties },
      change: { messageId: drawingMessage.id },
      asOf,
    }).catch(() => {
      // Back to how it was, with the reason in the popup.
      setRestoring((ids) => new Set([...ids].filter((other) => other !== id)));
      setTarget(target);
    });
  };

  // Frames the map. On arrival, the whole Nachrichtenkarte layer: the operator first needs the
  // overview. From then on, what the selected message did, once per message and as soon as its
  // history is known. Only once: later drawing must not move the map under the operator.
  const focusedMessage = useRef<string | undefined>(undefined);
  const positioned = useRef(false);
  useEffect(() => {
    if (map === undefined || drawingMessage === undefined) return;

    const frame = (geometries: Geometry[]) => {
      if (geometries.length === 0) return;

      const [west, south, east, north] = bbox({ type: "GeometryCollection", geometries });
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { animate: true, maxZoom: FOCUS_MAX_ZOOM, padding: 80 },
      );
    };

    if (!positioned.current) {
      // The layers have not arrived yet.
      if (layer === undefined) return;

      positioned.current = true;
      focusedMessage.current = drawingMessage.id;
      frame(layerToFeatureCollection(layer).features.map((f) => f.geometry));

      return;
    }

    if (!ready || focusedMessage.current === drawingMessage.id) return;

    focusedMessage.current = drawingMessage.id;
    frame([...halos.values()].flatMap((h) => (h.geometry ? [h.geometry] : [])));
  }, [drawingMessage, halos, layer, map, ready]);

  if (!enabled || !drawingMessage || (halos.size === 0 && state.removedFeatures.length === 0)) {
    return null;
  }

  // A feature just deleted here shows as a ghost before the history has caught up with it.
  const ghosts = withLocalRemovals(halos, state.removedFeatures, drawingMessage.id, placedHere);

  const features: Feature[] = [];
  const removed: Feature[] = [];
  for (const f of layerToFeatureCollection(layer).features) {
    const halo = f.id === undefined ? undefined : halos.get(String(f.id));
    if (halo && halo.kind !== "removed") {
      features.push({ ...f, properties: { halo: halo.kind } });
    }
  }
  for (const [id, halo] of ghosts) {
    if (halo.kind === "removed" && halo.lastGeometry && !restoring.has(id)) {
      features.push({
        type: "Feature",
        id,
        geometry: halo.lastGeometry,
        properties: { halo: "removed", featureId: id },
      });
      removed.push(
        convertFeatureToGeoJsonFeature(
          {
            id,
            geometry: halo.lastGeometry,
            properties: halo.lastProperties ?? {},
            createdAt: new Date(0),
            updatedAt: null,
            deletedAt: null,
          },
          "message-removed",
        ),
      );
    }
  }
  const own: FeatureCollection = { type: "FeatureCollection", features };

  return (
    <>
      {canRestore && target && (
        <Popup
          longitude={target.lng}
          latitude={target.lat}
          closeButton={false}
          closeOnClick={false}
          closeOnMove={false}
          maxWidth="none"
          offset={12}
          onClose={() => setTarget(undefined)}
        >
          <div className="w-64 p-3 text-sm text-gray-800">
            <p className="mb-2">{t("messageMap.restoreHint")}</p>
            {restoreState.error && (
              <p className="mb-2 text-xs text-red-600">{t(`errors.${restoreState.error.code}`)}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" disabled={restoreState.loading} onClick={restore}>
                <FontAwesomeIcon icon={faRotateLeft} />
                {t("messageMap.restore")}
              </Button>
              <Button variant="light" size="sm" onClick={() => setTarget(undefined)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        </Popup>
      )}
      {removed.length > 0 && renderRemoved({ type: "FeatureCollection", features: removed })}
      <Source id={SOURCE_ID} type="geojson" data={own}>
        <MapLayer
          id={`${SOURCE_ID}-fill`}
          type="fill"
          filter={["==", ["geometry-type"], "Polygon"]}
          paint={{ "fill-color": HALO_COLOR, "fill-opacity": 0.2 }}
        />
        <MapLayer
          id={`${SOURCE_ID}-line`}
          type="line"
          filter={["all", ["!=", ["geometry-type"], "Point"], ["!=", ["get", "halo"], "removed"]]}
          paint={{
            "line-color": HALO_COLOR,
            "line-width": LINE_WIDTH,
            "line-opacity": 0.5,
            "line-blur": 2,
          }}
        />
        {/* Dashed for what is gone, so it reads as removed without relying on the colour. */}
        <MapLayer
          id={`${SOURCE_ID}-line-removed`}
          type="line"
          filter={["all", ["!=", ["geometry-type"], "Point"], ["==", ["get", "halo"], "removed"]]}
          paint={{
            "line-color": HALO_COLOR,
            "line-width": LINE_WIDTH,
            "line-opacity": 0.7,
            "line-dasharray": [1.5, 1.5],
          }}
        />
        <MapLayer
          id={`${SOURCE_ID}-point`}
          type="circle"
          filter={["==", ["geometry-type"], "Point"]}
          paint={{
            "circle-radius": POINT_RADIUS,
            "circle-color": HALO_COLOR,
            "circle-opacity": 0.2,
            "circle-stroke-color": HALO_COLOR,
            "circle-stroke-width": 2,
            "circle-stroke-opacity": 0.8,
          }}
        />
      </Source>
    </>
  );
}

/** A slot in one of the map's corners, so a control lines up with the others there. */
class ControlSlot implements IControl {
  readonly container = document.createElement("div");

  onAdd(): HTMLElement {
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-group mb-3! text-black";

    return this.container;
  }

  onRemove(): void {
    this.container.remove();
  }
}

export function MessageHighlightToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  // In the top right, with the drawing controls.
  const slot = useControl<ControlSlot>(() => new ControlSlot(), { position: "top-right" });

  // Controls stack in the order they were added; this one goes on top, whatever else is there.
  useEffect(() => {
    slot.container.parentElement?.prepend(slot.container);
  }, [slot]);

  return createPortal(
    <button
      type="button"
      aria-pressed={enabled}
      aria-label={t("messageMap.highlight")}
      title={`${t("messageMap.highlight")}: ${t("messageMap.highlightHint")}`}
      className={clsx("maplibregl-ctrl-icon", enabled && "text-amber-500!")}
      onClick={onToggle}
    >
      <FontAwesomeIcon icon={faBullseye} size="lg" />
    </button>,
    slot.container,
  );
}
