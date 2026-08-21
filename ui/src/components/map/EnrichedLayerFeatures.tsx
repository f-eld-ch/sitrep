import bearing from "@turf/bearing";
import { point } from "@turf/helpers";
import { markerSpriteKey } from "@f-eld-ch/babs-core";
import { babsImage } from "components/babs/iconResolver";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { Layer, Source } from "react-map-gl/maplibre";

const enrichFeature = (
  f: Feature<Geometry, GeoJsonProperties>,
): Feature<Geometry, GeoJsonProperties>[] => {
  if (f === undefined) {
    return [];
  }

  const features: Feature<Geometry, GeoJsonProperties>[] = [];

  if (f.geometry.type === "LineString") {
    const enrich: EnrichLineConfig | undefined = EnrichLineStringMap[f.properties?.lineType];
    if (enrich !== undefined) {
      if (enrich.iconStart) {
        const startPoint = point(f.geometry.coordinates[0]);
        startPoint.id = `${f.id}:start`;
        startPoint.properties = {
          parent: f.id,
          // Already a fully-namespaced sprite id; do not prefix again.
          icon: enrich.iconStart,
          iconRotation:
            bearing(point(f.geometry.coordinates[0]), point(f.geometry.coordinates[1])) +
            enrich.iconRotation,
        };
        features.push(startPoint);
      }

      if (enrich.iconEnd) {
        const endPoint = point(f.geometry.coordinates.slice(-1)[0]);
        endPoint.id = `${f.id}:end`;
        endPoint.properties = {
          parent: f.id,
          icon: enrich.iconEnd,
          iconRotation:
            bearing(
              f.geometry.coordinates.slice(-1)[0],
              point(f.geometry.coordinates.slice(-2)[0]),
            ) + enrich.iconRotation,
        };
        features.push(endPoint);
      }
    }
  }

  return features;
};

interface EnrichLineConfig {
  /**
   * Fully-namespaced sprite image id, e.g. `babs:1101` or `babs:marker-chevron-blue`.
   *
   * Unlike `properties.icon` on real features — which stores a readable alias and is
   * resolved by the `match` expression in styleGenerator — these caps live on synthetic
   * features that are rebuilt on every render and never persisted. So there is no
   * data-compatibility concern and the sprite key can be used directly.
   */
  iconStart?: string;
  iconEnd?: string;
  iconRotation: number;
}

/**
 * Direction arrowhead for movement/action lines. Previously borrowed the `Others.Einsatz`
 * / `Others.Verschiebung` glyphs; now uses the catalogue's purpose-built marker. Blue
 * matches the colour these line types are drawn in (see `LineTypes` colours).
 */
const DIRECTION_ARROW = babsImage(markerSpriteKey("chevron-blue"));

/** End-of-line arrowhead only — start is left bare so the line reads directionally. */
const directional = (): EnrichLineConfig => ({
  iconStart: undefined,
  iconEnd: DIRECTION_ARROW,
  iconRotation: 90,
});

/**
 * Damage severity marked at both ends of the affected road segment. These are semantic
 * symbols rather than arrowheads, so they stay catalogue icons rather than becoming
 * chevrons: 1101 Beschädigung, 1102 Teilzerstörung, 1103 Totalzerstörung.
 */
const damageExtent = (id: "1101" | "1102" | "1103"): EnrichLineConfig => ({
  iconStart: babsImage(id),
  iconEnd: babsImage(id),
  iconRotation: 90,
});

/**
 * Which line types get start/end caps, and which sprite image each cap uses.
 * Exported so `styleImageResolution.test.ts` can assert every cap actually exists in the
 * sprite atlas — these ids bypass the `match` expression, so nothing else would catch a
 * typo or an unprefixed key here.
 */
export const EnrichLineStringMap: Record<string, EnrichLineConfig> = {
  begehbar: damageExtent("1101"),
  schwerBegehbar: damageExtent("1102"),
  unpassierbar: damageExtent("1103"),
  beabsichtigteErkundung: directional(),
  durchgeführteErkundung: directional(),
  beabsichtigteVerschiebung: directional(),
  rettungsAchse: directional(),
  durchgeführteVerschiebung: directional(),
  beabsichtigterEinsatz: directional(),
  durchgeführterEinsatz: directional(),
};

const EnrichedSymbolSource = (props: EnrichedFeaturesProps) => {
  const { id, featureCollection } = props;
  const enrichedFC: FeatureCollection = {
    type: "FeatureCollection",
    features: [],
  };
  enrichedFC.features = Object.assign(
    [],
    featureCollection.features
      .filter((f) => f.properties?.deletedAt === null)
      .filter((f) => f.id !== props.selectedFeature)
      .flatMap((f) => enrichFeature(f)),
  );

  return (
    <Source key={id} type="geojson" data={enrichedFC}>
      <Layer
        id={`${id}-enriched-points`}
        type="symbol"
        layout={{
          // ["image", …] is required for coalesce to fall through: a bare ["get", …]
          // yields a non-null string even when the sprite has no such image, so the
          // fallback was unreachable and an unknown cap rendered blank. The previous
          // fallback, "default_marker", existed in no atlas either.
          "icon-image": ["coalesce", ["image", ["get", "icon"]], ["image", DIRECTION_ARROW]],
          "icon-allow-overlap": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.1, 17, 1.4],
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

interface EnrichedFeaturesProps {
  id: string | undefined;
  featureCollection: FeatureCollection;
  selectedFeature?: string | number | undefined;
}

export { EnrichedFeaturesSource, EnrichedSymbolSource };

export default EnrichedFeaturesSource;
