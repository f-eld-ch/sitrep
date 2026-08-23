import type { FeatureCollection } from "geojson";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { ARROW } from "./enrichment/arrow";
import { enrichFeature } from "./enrichment/enrichFeature";
import { EnrichLineStringMap, EnrichPolygonMap } from "./enrichment/registry";

/**
 * An overlay of features derived from the active layer's own geometry — arrowheads, direction
 * indicators, emphasised stretches of outline.
 *
 * These are the parts of a BABS symbol the catalogue defines but GeoJSON cannot express. They
 * are rebuilt on every render and never persisted, and they live in their own source, so they
 * neither collide with the draw layers nor need a `styleGenerator` entry: the layers here are
 * the only ones that ever see them.
 *
 * The geometry itself is built in `./enrichment`; this file is only the rendering.
 */

interface EnrichedFeaturesProps {
  id: string | undefined;
  featureCollection: FeatureCollection;
}

const EnrichedSymbolSource = ({ id, featureCollection }: EnrichedFeaturesProps) => {
  // Includes the selected feature. Skipping it used to make the indicator vanish for exactly
  // as long as you were editing the geometry that determines it, which is when it is most
  // useful — and on the active layer this now re-runs on every animation frame of a vertex
  // drag (see `useLiveDrawGeometry` in Map.tsx) rather than once per save, hence the memo.
  const enrichedFC = useMemo<FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: featureCollection.features
        .filter((f) => f.properties?.deletedAt === null)
        .flatMap(enrichFeature),
    }),
    [featureCollection],
  );

  return (
    <Source key={id} type="geojson" data={enrichedFC}>
      {/*
        Shafts and emphasised outline. Painted to match `gl-draw-line-inactive-solidlines` in
        styleGenerator, so a shaft is the same stroke a brandUebergriffErfolgt line gets.
        Declared before the symbol layer so a chevron sits on top of its own shaft.
      */}
      <Layer
        id={`${id}-enriched-lines`}
        type="line"
        filter={["==", ["geometry-type"], "LineString"]}
        layout={{
          "line-cap": "round",
          "line-join": "round",
        }}
        paint={{
          "line-color": ["coalesce", ["get", "color"], "#000000"],
          "line-opacity": 0.7,
          // Data-driven so the emphasised stretch of outline can share this layer with the
          // arrow shafts instead of needing one of its own.
          "line-width": ["coalesce", ["get", "width"], 2],
        }}
      />
      <Layer
        id={`${id}-enriched-points`}
        type="symbol"
        // Without this the layer would also place an icon at each shaft's centre, since a
        // symbol layer happily anchors a LineString.
        filter={["==", ["geometry-type"], "Point"]}
        layout={{
          // ["image", …] is required for coalesce to fall through: a bare ["get", …] yields a
          // non-null string even when the sprite has no such image, so the fallback was
          // unreachable and an unknown cap rendered blank.
          "icon-image": ["coalesce", ["image", ["get", "icon"]], ["image", ARROW.movement]],
          "icon-allow-overlap": true,
          // Divided by 1.5 alongside the point markers when babs-sprites 0.4.2 grew the 1x
          // cell from 32px to 48px, so arrowheads stayed proportional to the icons they cap.
          "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.067, 17, 0.933],
          "icon-rotation-alignment": "map",
          "icon-pitch-alignment": "map",
          "icon-rotate": ["coalesce", ["get", "iconRotation"], 0],
        }}
      />
    </Source>
  );
};

const EnrichedFeaturesSource = (props: EnrichedFeaturesProps) => {
  if (props.id === undefined) {
    return null;
  }

  return <EnrichedSymbolSource {...props} />;
};

// Re-exported so callers and tests keep a single entry point into the enrichment pipeline.
export { enrichFeature, EnrichLineStringMap, EnrichPolygonMap };
export { EnrichedFeaturesSource, EnrichedSymbolSource };

export default EnrichedFeaturesSource;
