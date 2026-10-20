import type { Feature, FeatureCollection } from "geojson";
import { useContext, useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { LayerContext } from "../LayerContext";
import { MapTimeContext } from "../MapTimeContext";
import { createTimeLabelStyle } from "../styleGenerator";
import { formatTimeLabel } from "../timeLabel";

const SOURCE_ID = "time-labels";
const STYLE = createTimeLabelStyle();

/**
 * The time each drawing first appeared, written on the map in the drawing's colour. It is the
 * time of the first message the drawing was made for; moving or restyling it later does not
 * change it. Same day as the timeline slider shows (or today when live): the clock time only.
 */
export function TimeLabels() {
  const { state } = useContext(LayerContext);
  const { asOf } = useContext(MapTimeContext);
  // Live follows the clock only as far as the day: re-reading it on every render is enough.
  const reference = asOf ?? new Date();

  const data = useMemo<FeatureCollection>(() => {
    const features: Feature[] = [];
    for (const { layer, isVisible } of state.layers) {
      if (!isVisible || !layer) continue;

      for (const f of layer.features) {
        if (!f?.placedAt) continue;

        features.push({
          type: "Feature",
          id: f.id,
          geometry: f.geometry,
          properties: {
            color: f.properties?.color,
            timeLabel: formatTimeLabel(f.placedAt, reference),
          },
        });
      }
    }

    return { type: "FeatureCollection", features };
    // The label only depends on the day of the reference, so a new Date each render must not rebuild it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.layers, reference.toDateString()]);

  return (
    <Source id={SOURCE_ID} type="geojson" data={data}>
      {STYLE.map((style) => (
        <Layer key={style.id} {...style} />
      ))}
    </Source>
  );
}
