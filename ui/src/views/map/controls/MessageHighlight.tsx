import { faBullseye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import type { Feature, FeatureCollection } from "geojson";
import type { ExpressionSpecification } from "maplibre-gl";
import { useContext, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Layer as MapLayer, Source } from "react-map-gl/maplibre";
import { useParams } from "react-router";
import {
  convertFeatureToGeoJsonFeature,
  layerToFeatureCollection,
  useMessageFeatureHalos,
} from "api";
import { LayerContext } from "../LayerContext";
import { MapTimeContext } from "../MapTimeContext";

const SOURCE_ID = "message-highlight";

// The halo follows the zoom ramps of what it surrounds: half the icon (a 48px cell scaled from
// 0.2 at zoom 12 to 1.667 at zoom 20) and a little margin, and the line width ramp plus margin.
const POINT_RADIUS: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 12, 9, 20, 44];
const LINE_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["exponential", 1],
  ["zoom"],
  12,
  6,
  19,
  28,
];

/** Green for what the message put on the map, orange for what it changed, grey for what it removed. */
const HALO_COLOR = [
  "match",
  ["get", "halo"],
  "added",
  "#22c55e",
  "removed",
  "#9ca3af",
  "#f59e0b",
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
  const { state } = useContext(LayerContext);
  const { drawingMessage } = useContext(MapTimeContext);
  const layer = state.layers.find((l) => l.layer.kind === "MESSAGE_MAP")?.layer;
  // Changes whenever a feature is drawn, modified or removed, which is when the history is re-read.
  const refreshKey = JSON.stringify(layer?.features ?? []);
  const halos = useMessageFeatureHalos(incidentId, drawingMessage?.id, refreshKey);

  if (!enabled || !drawingMessage || halos.size === 0) return null;

  const features: Feature[] = [];
  const removed: Feature[] = [];
  for (const f of layerToFeatureCollection(layer).features) {
    const halo = f.id === undefined ? undefined : halos.get(String(f.id));
    if (halo && halo.kind !== "removed") {
      features.push({ ...f, properties: { halo: halo.kind } });
    }
  }
  for (const [id, halo] of halos) {
    if (halo.kind === "removed" && halo.lastGeometry) {
      features.push({
        type: "Feature",
        id,
        geometry: halo.lastGeometry,
        properties: { halo: "removed" },
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
          filter={["!=", ["geometry-type"], "Point"]}
          paint={{
            "line-color": HALO_COLOR,
            "line-width": LINE_WIDTH,
            "line-opacity": 0.5,
            "line-blur": 2,
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

export function MessageHighlightToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="maplibregl-ctrl maplibregl-ctrl-group mb-0! self-end text-black">
      <button
        type="button"
        aria-pressed={enabled}
        aria-label={t("messageMap.highlight")}
        title={`${t("messageMap.highlight")}: ${t("messageMap.highlightHint")}`}
        className={clsx("maplibregl-ctrl-icon", enabled && "text-amber-500!")}
        onClick={onToggle}
      >
        <FontAwesomeIcon icon={faBullseye} size="lg" />
      </button>
    </div>
  );
}
