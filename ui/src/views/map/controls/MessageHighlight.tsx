import { faBullseye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import type { FeatureCollection } from "geojson";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { Layer as MapLayer, Source } from "react-map-gl/maplibre";
import { useParams } from "react-router";
import { layerToFeatureCollection, useMessageFeatureIds } from "api";
import { LayerContext } from "../LayerContext";
import { MapTimeContext } from "../MapTimeContext";

const SOURCE_ID = "message-highlight";
const COLOR = "#f59e0b";

/**
 * A virtual layer of its own: only what was drawn for the message being worked on, picked out
 * with a halo on top of everything else, which stays visible. Nothing is stored for it; it is
 * derived from the feature history.
 */
export function MessageHighlight({ enabled }: { enabled: boolean }) {
  const { incidentId } = useParams();
  const { state } = useContext(LayerContext);
  const { drawingMessage } = useContext(MapTimeContext);
  const layer = state.layers.find((l) => l.layer.kind === "MESSAGE_MAP")?.layer;
  // Changes whenever a feature is drawn, moved or removed, which is when the history is re-read.
  const refreshKey = (layer?.features ?? []).map((f) => f?.id).join(",");
  const ids = useMessageFeatureIds(incidentId, drawingMessage?.id, refreshKey);

  if (!enabled || !drawingMessage || ids.size === 0) return null;

  const all = layerToFeatureCollection(layer);
  const own: FeatureCollection = {
    type: "FeatureCollection",
    features: all.features.filter((f) => f.id !== undefined && ids.has(String(f.id))),
  };

  return (
    <Source id={SOURCE_ID} type="geojson" data={own}>
      <MapLayer
        id={`${SOURCE_ID}-fill`}
        type="fill"
        filter={["==", ["geometry-type"], "Polygon"]}
        paint={{ "fill-color": COLOR, "fill-opacity": 0.2 }}
      />
      <MapLayer
        id={`${SOURCE_ID}-line`}
        type="line"
        filter={["!=", ["geometry-type"], "Point"]}
        paint={{ "line-color": COLOR, "line-width": 8, "line-opacity": 0.45, "line-blur": 2 }}
      />
      <MapLayer
        id={`${SOURCE_ID}-point`}
        type="circle"
        filter={["==", ["geometry-type"], "Point"]}
        paint={{
          "circle-radius": 22,
          "circle-color": COLOR,
          "circle-opacity": 0.2,
          "circle-stroke-color": COLOR,
          "circle-stroke-width": 3,
          "circle-stroke-opacity": 0.8,
        }}
      />
    </Source>
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
