import type { Feature, GeoJsonProperties, Geometry } from "geojson";

/**
 * Shapes shared by the enrichment pipeline: what a feature can be decorated with, and what
 * the builders hand back.
 *
 * Enrichment turns a stored feature into extra, throwaway features that carry the parts of a
 * BABS symbol the catalogue defines but GeoJSON cannot express — an arrowhead, a direction
 * indicator, a stretch of emphasised outline.
 */

/**
 * A feature synthesised from a stored one. Rebuilt on every render and never persisted,
 * which is why these may carry fully-namespaced sprite ids directly rather than the readable
 * aliases `styleGenerator`'s `match` expression resolves for real features.
 */
export type SyntheticFeature = Feature<Geometry, GeoJsonProperties>;

/**
 * A generated arrow: a shaft plus a chevron head.
 *
 * `lengthRatio` is read against whatever measure the builder considers the feature's size —
 * a line's own length for the slide arrow, a ring's bounding-box diagonal for the flow arrow
 * — so it is documented at each registry entry rather than here.
 */
export interface ArrowConfig {
  /** Fully-namespaced chevron sprite for the arrow head. */
  icon: string;
  /** Shaft stroke colour, read back off `properties.color` by the enriched line layer. */
  color: string;
  /** Shaft length as a fraction of the feature's size. */
  lengthRatio: number;
}

/** What a line type gets decorated with, keyed by `properties.lineType`. */
export interface EnrichLineConfig {
  /**
   * Fully-namespaced sprite image id, e.g. `babs:1101` or `babs:marker-chevron-blue`.
   *
   * Unlike `properties.icon` on real features — which stores a readable alias and is
   * resolved by the `match` expression in styleGenerator — these caps live on synthetic
   * features, so the sprite key can be used directly.
   */
  iconStart?: string;
  iconEnd?: string;
  /**
   * Added to a computed bearing to line the artwork up with it.
   *
   * The caps feed in a *reversed* bearing, which is why they add this where the arrows
   * subtract it. See `arrowFeatures`.
   */
  iconRotation: number;
  /**
   * Perpendicular direction indicator derived from the geometry. Unlike the caps above this
   * is not tied to an endpoint, so a line type may carry it with no cap at all.
   */
  slideArrow?: ArrowConfig;
}

/** What a zone type gets decorated with, keyed by `properties.zoneType`. */
export interface EnrichPolygonConfig {
  flowArrow?: ArrowConfig;
}
