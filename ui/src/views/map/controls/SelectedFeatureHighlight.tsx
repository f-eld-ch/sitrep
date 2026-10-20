import { useContext } from "react";
import { Layer as MapLayer, Source } from "react-map-gl/maplibre";
import { layerToFeatureCollection } from "api";
import { LayerContext } from "../LayerContext";
import { LINE_WIDTH, POINT_RADIUS } from "./haloStyle";

const SOURCE_ID = "selected-feature";
const COLOR = "#7c3aed";

/**
 * A ring around the feature the user selected, so it is clear which one the message stack beside
 * the map is about. The ring follows the same zoom ramps as the message halos.
 */
export function SelectedFeatureHighlight({ featureId }: { featureId: string | undefined }) {
  const { state } = useContext(LayerContext);

  if (featureId === undefined) return null;

  const feature = state.layers
    .filter((entry) => entry.isVisible)
    .flatMap((entry) => layerToFeatureCollection(entry.layer).features)
    .find((f) => f.id !== undefined && String(f.id) === featureId);
  if (feature === undefined) return null;

  return (
    <Source id={SOURCE_ID} type="geojson" data={{ type: "FeatureCollection", features: [feature] }}>
      <MapLayer
        id={`${SOURCE_ID}-fill`}
        type="fill"
        filter={["==", ["geometry-type"], "Polygon"]}
        paint={{ "fill-color": COLOR, "fill-opacity": 0.15 }}
      />
      <MapLayer
        id={`${SOURCE_ID}-line`}
        type="line"
        filter={["!=", ["geometry-type"], "Point"]}
        paint={{
          "line-color": COLOR,
          "line-width": LINE_WIDTH,
          "line-opacity": 0.6,
          "line-blur": 1,
        }}
      />
      <MapLayer
        id={`${SOURCE_ID}-point`}
        type="circle"
        filter={["==", ["geometry-type"], "Point"]}
        paint={{
          "circle-radius": POINT_RADIUS,
          "circle-color": COLOR,
          "circle-opacity": 0.12,
          "circle-stroke-color": COLOR,
          "circle-stroke-width": 3,
          "circle-stroke-opacity": 0.9,
        }}
      />
    </Source>
  );
}
