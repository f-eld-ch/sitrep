import "./control-panel.css";
import "./Map.scss";
import { setBabsSpriteLang, withBabsSprite } from "@f-eld-ch/babs-sprites";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import bbox from "@turf/bbox";
import classNames from "classnames";
import { BABS_SPRITE_BASE } from "components/babs/iconResolver";
import EnrichedLayerFeatures, { EnrichedSymbolSource } from "components/map/EnrichedLayerFeatures";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { first, isEqual, throttle } from "lodash";
import * as maplibre from "maplibre-gl";
import { setMaxParallelImageRequests, setWorkerCount, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AttributionControl,
  FullscreenControl,
  Map as MapClass,
  Layer as MapLayer,
  MapProvider,
  NavigationControl,
  ScaleControl,
  Source,
  useMap,
} from "react-map-gl/maplibre";
import { Navigate, useParams } from "react-router";
import type { Layer } from "types/layer";
import {
  cleanFeature,
  layerToFeatureCollection,
  useAddFeature,
  useDeleteFeature,
  useLayersForIncident,
  useModifyFeature,
} from "api";
import { v3 as uuidv3, validate as validateUUID } from "uuid";
import ActiveWMSLayers from "./ActiveWMSLayers";
import { BabsIconController } from "./controls/BabsIconController";
import DrawControl from "./controls/DrawControl";
import ExportControl from "./controls/ExportControl";
import LayerControl from "./controls/LayerControl";
import SearchControl from "./controls/Searchbox";
import { MapStyleProvider, StyleController, useMapStyle } from "./controls/StyleController";
import { LayerContext, LayersProvider } from "./LayerContext";
import { IncidentContext } from "utils";
import { createMapStyle } from "./styleGenerator";

// Initialize maplibregl globals once at module load to avoid repeated side-effects
// when React Strict Mode mounts components multiple times in development.
try {
  // guard in case these methods are not present in some environments
  if (typeof setMaxParallelImageRequests === "function") {
    setMaxParallelImageRequests(150);
  }
  if (typeof setWorkerCount === "function") {
    setWorkerCount(6);
  }
  setWorkerUrl(workerUrl);
} catch (e) {
  console.error("Error setting maplibregl globals:", e);
}

const modes = {
  ...MapboxDraw.modes,
};

/**
 * Keeps the map's BABS sprite in step with the UI language.
 *
 * Swaps the sprite in place via `addSprite`/`removeSprite` rather than calling
 * `map.setStyle()`, which would tear down every layer and drop the features currently
 * drawn. Renders nothing.
 */
function BabsSpriteLanguage() {
  const { current: map } = useMap();
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;

  useEffect(() => {
    if (!map) return;
    // maplibre-gl's Map structurally satisfies the helper's MapLike contract
    // (getSprite/addSprite/removeSprite/once), so no cast is needed.
    void setBabsSpriteLang(map.getMap(), lang, BABS_SPRITE_BASE);
  }, [map, lang]);

  return null;
}

function MapView() {
  const { selectedStyle: mapStyle } = useMapStyle();
  const { i18n } = useTranslation();

  // Resolved once per basemap style, NOT per language: producing a new style object makes
  // react-map-gl call setStyle, which rebuilds every layer. Language changes are handled
  // imperatively by <BabsSpriteLanguage /> instead.
  //
  // The language is read inside the memo rather than listed as a dependency, which is what
  // keeps it out of the recompute while still picking up the current value whenever the
  // basemap does change. This used to be done with a ref written during render — same
  // effect, but writing a ref while rendering is not safe under concurrent rendering.
  const styleWithBabsSprite = useMemo(
    () =>
      withBabsSprite(mapStyle.style, i18n.resolvedLanguage ?? i18n.language, {
        base: BABS_SPRITE_BASE,
        unSigns: true,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- language is deliberately excluded
    [mapStyle.style, i18n.resolvedLanguage, i18n.language],
  );

  const mapClass = classNames({
    "is-flex-grow-1": true,
    "is-align-items-stretch": true,
    "is-align-self-strech": true,
    "mt-5": true,
    "theme-light": true,
  });

  return (
    <div className={mapClass} data-theme="light">
      <MapClass
        mapLib={maplibre}
        initialViewState={{
          latitude: 46.87148,
          longitude: 8.62994,
          zoom: 5,
          bearing: 0,
        }}
        attributionControl={false}
        minZoom={9}
        maxZoom={19}
        mapStyle={styleWithBabsSprite}
        scrollZoom={true}
        reuseMaps={false}
        RTLTextPlugin={undefined}
      >
        <BabsSpriteLanguage />
        <SearchControl />
        <AttributionControl position="bottom-left" compact={true} />
        {/* All Map Controls */}
        <FullscreenControl position={"top-left"} />
        <NavigationControl position={"top-left"} visualizePitch={true} />
        <ScaleControl unit={"metric"} position={"bottom-left"} />
        <ExportControl position="bottom-left" />
        {/* Layersprovider and Draw */}
        <Layers />
      </MapClass>
    </div>
  );
}

function Layers() {
  const { state } = useContext(LayerContext);

  return (
    <>
      <div className="maplibregl-ctrl-bottom-right is-flex is-flex-direction-column mx-2 my-2">
        <LayerControl />
        <StyleController />
      </div>

      {/* Active Layer */}
      <ActiveLayer />
      <BabsIconController />

      {/* Inactive Layers */}
      <InactiveLayers
        layers={
          state.layers
            .filter((l) => l.layer?.id !== state.activeLayer)
            .filter((l) => l.isVisible)
            .map((l) => l.layer) || []
        }
      />
      <ActiveWMSLayers />
    </>
  );
}

// LayerFetcher polls from the layers and sets the layers from remote
function LayerFetcher() {
  const { incidentId } = useParams();
  const { state, dispatch } = useContext(LayerContext);

  const result = useLayersForIncident(incidentId);

  useEffect(() => {
    if (result.status !== "ready") return;
    const stateLayers = state.layers.map((l) => l.layer);
    // result.data reference is stable when Apollo cache is unchanged (useMemo keyed on data),
    // so isEqual only passes when content actually changed.
    if (!isEqual(result.data.layers, stateLayers)) {
      dispatch({ type: "SET_LAYERS", payload: { layers: result.data.layers } });
    }
  }, [result, dispatch, state.layers]);

  return null;
}

/**
 * How often the live geometry is re-read while a vertex is being dragged. Comfortably below
 * a frame budget, and still fast enough that the indicator reads as following the cursor.
 */
const LIVE_GEOMETRY_INTERVAL_MS = 80;

/**
 * Fired by mapbox-gl-draw on every one of its renders, including mid-drag — unlike
 * `draw.update`, which `direct_select` only fires on mouse-up.
 */
const DRAW_RENDER_EVENT = "draw.render";

/**
 * The selected feature's geometry as mapbox-gl-draw currently holds it, rather than as it
 * was last persisted — or `undefined` when nothing is selected.
 *
 * `direct_select` only fires `draw.update` on mouse-up, and the geometry then round-trips
 * through a mutation and Apollo before it comes back down, so anything driven off the stored
 * collection lags a vertex drag by a whole gesture. `draw.render` fires every frame while
 * dragging, which is what makes a live indicator possible.
 *
 * Throttled rather than debounced: a debounce would hold the indicator still for the whole
 * drag and only place it once the pointer stopped, which is the opposite of the point. The
 * trailing edge still fires, so the final position is exact when a gesture ends between
 * ticks. The geometry is also compared before it is stored, because `draw.render` fires on
 * pans and zooms too — without that guard every map movement would rebuild the enriched
 * source for nothing.
 */
function useLiveDrawGeometry(
  map: ReturnType<typeof useMap>["current"],
  draw: unknown,
  selectedFeature: string | number | undefined,
): Geometry | undefined {
  // Tagged with the id it was read from, so geometry left over from a previously selected
  // feature can never be applied to the next one. That also means the effect never has to
  // clear the state synchronously on deselect.
  const [live, setLive] = useState<{ id: string; geometry: Geometry } | undefined>(undefined);

  useEffect(() => {
    if (map === undefined || !isDrawLike(draw) || selectedFeature === undefined) {
      return;
    }

    const id = String(selectedFeature);

    const read = () => {
      try {
        const current = draw.get(id);
        if (current === undefined) {
          return;
        }
        setLive((previous) =>
          previous?.id === id && isEqual(previous.geometry, current.geometry)
            ? previous
            : { id, geometry: current.geometry },
        );
      } catch {
        // The draw instance can be mid-teardown; the next tick will re-read.
      }
    };

    const onRender = throttle(read, LIVE_GEOMETRY_INTERVAL_MS, {
      leading: true,
      trailing: true,
    });
    // mapbox-gl-draw fires its events *through* the map, but they are not part of MapLibre's
    // own event map, so `on`/`off` do not accept the name. Narrowed to just the two methods
    // rather than casting the map to `any`, so a typo in either is still caught.
    const drawEvents = map as unknown as {
      on: (type: string, listener: () => void) => void;
      off: (type: string, listener: () => void) => void;
    };

    drawEvents.on(DRAW_RENDER_EVENT, onRender);
    return () => {
      drawEvents.off(DRAW_RENDER_EVENT, onRender);
      onRender.cancel();
    };
  }, [map, draw, selectedFeature]);

  return selectedFeature !== undefined && live?.id === String(selectedFeature)
    ? live.geometry
    : undefined;
}

function ActiveLayer() {
  // A ref, not state: this only latches the one-off viewport fit and is never read
  // during render, so making it state would force a pointless extra render.
  const initialized = useRef(false);
  const { current: map } = useMap();
  const { state } = useContext(LayerContext);
  const featureCollection = useMemo(
    () =>
      layerToFeatureCollection(
        first(state.layers.filter((l) => l.layer.id === state.activeLayer).map((l) => l.layer)),
      ),
    [state.layers, state.activeLayer],
  );

  // Enrichment follows the geometry under the cursor, not the last saved one, so the flow
  // arrow and the slide arrow track a vertex as it is dragged rather than jumping once the
  // drag ends.
  const liveGeometry = useLiveDrawGeometry(map, state.draw, state.selectedFeature);
  const liveCollection = useMemo(() => {
    if (liveGeometry === undefined || state.selectedFeature === undefined) {
      return featureCollection;
    }
    return {
      ...featureCollection,
      features: featureCollection.features.map((f) =>
        f.id === state.selectedFeature ? { ...f, geometry: liveGeometry } : f,
      ),
    };
  }, [featureCollection, liveGeometry, state.selectedFeature]);

  useEffect(() => {
    if (initialized.current || !map?.loaded) {
      return;
    }
    // only run this for the initialization as we don't want to continously
    // change the map viewport on new features
    if (map !== undefined && featureCollection.features.length > 0) {
      const bboxArray = bbox(featureCollection);
      map.fitBounds(
        [
          [bboxArray[0], bboxArray[1]],
          [bboxArray[2], bboxArray[3]],
        ],
        {
          animate: true,
          padding: { top: 30, bottom: 30, left: 30, right: 30 },
        },
      );
      initialized.current = true;
    }
  }, [featureCollection, map]);

  return (
    <>
      <Draw />
      <EnrichedLayerFeatures id={state.activeLayer} featureCollection={liveCollection} />
    </>
  );
}

function Draw() {
  const { state, dispatch } = useContext(LayerContext);
  const { incidentId } = useParams();
  const { current: map } = useMap();

  const [addFeature] = useAddFeature();
  const [modifyFeature] = useModifyFeature();
  const [deleteFeature] = useDeleteFeature();

  const onSelectionChange = useCallback(
    (e: FeatureEvent) => {
      const features: Feature[] = e.features;
      if (features?.length > 0) {
        const feature = first(features);
        dispatch({
          type: "SELECT_FEATURE",
          payload: { id: feature?.id?.toString() },
        });
      } else {
        dispatch({ type: "DESELECT_FEATURE", payload: null });
      }
    },
    [dispatch],
  );

  const onCreate = useCallback(
    (e: FeatureEvent, layer: string | undefined) => {
      if (layer === undefined) {
        return;
      }

      const createdFeatures: Feature[] = e.features;
      for (const f of createdFeatures) {
        const feature = cleanFeature(f);

        if (!validateUUID(f.id)) {
          feature.id = uuidv3(f.id?.toString() || "", uuidv3.URL);
        }

        void addFeature({
          layerId: layer,
          geometry: feature.geometry,
          id: String(feature.id ?? ""),
          properties: feature.properties,
          incidentId: incidentId ?? "",
        }).then(({ featureId }) => {
          dispatch({ type: "SELECT_FEATURE", payload: { id: featureId } });
        });

        if (f.id !== undefined) {
          state.draw?.delete([f.id.toString()]);
        }
      }
    },
    [addFeature, dispatch, incidentId, state.draw],
  );

  const onUpdate = useCallback(
    (e: FeatureEvent) => {
      const isPropertyOnly = e.action === "featureDetail";
      const updatedFeatures: Feature[] = e.features;
      for (const f of updatedFeatures) {
        const feature = cleanFeature(f);
        void modifyFeature({
          id: String(feature.id ?? ""),
          geometry: isPropertyOnly ? undefined : feature.geometry,
          properties: isPropertyOnly ? feature.properties : undefined,
          incidentId: incidentId ?? "",
        });
      }
    },
    [incidentId, modifyFeature],
  );

  const onDelete = useCallback(
    (e: FeatureEvent) => {
      const deletedFeatures: Feature[] = e.features;
      for (const f of deletedFeatures) {
        const feature = cleanFeature(f);
        void deleteFeature({ id: String(feature.id ?? ""), incidentId: incidentId ?? "" });
      }
      dispatch({ type: "DESELECT_FEATURE", payload: null });
    },
    [dispatch, deleteFeature, incidentId],
  );

  const onCombine = useCallback(
    (e: CombineFeatureEvent) => {
      onCreate({ features: e.createdFeatures }, state.activeLayer);
      onDelete({ features: e.deletedFeatures });
      dispatch({ type: "DESELECT_FEATURE", payload: null });
    },
    [dispatch, onCreate, onDelete, state.activeLayer],
  );

  // this is the effect which syncs the drawings
  useEffect(() => {
    if (state.draw && map?.loaded) {
      const featureCollection: FeatureCollection = layerToFeatureCollection(
        state.layers.find((l) => l.layer.id === state.activeLayer)?.layer,
      );

      safeDrawInvoke(state.draw, (d) => {
        d.deleteAll();
        d.set(featureCollection);
        // Restore draw-mode selection after the layer reset so the feature stays
        // visually selected (handles visible) when a property update triggers a redraw.
        if (state.selectedFeature && d.get(state.selectedFeature)) {
          d.changeMode("simple_select", {
            featureIds: [state.selectedFeature],
          });
        }
      });
    }
  }, [state.draw, map?.loaded, state.layers, state.activeLayer, state.selectedFeature]);

  // this is the effect which syncs the drawings
  useEffect(() => {
    if (state.draw && map?.loaded) {
      if (!isDrawLike(state.draw)) {
        // eslint-disable-next-line no-console
        console.warn("Draw control missing get/changeMode; skipping selection sync.");
        return;
      }

      if (state.selectedFeature === undefined) {
        safeDrawInvoke(state.draw, (d) => {
          d.changeMode("simple_select");
        });
        return;
      }

      // Check if the selected feature exists in the draw control and then select it
      const exists = safeDrawInvoke(state.draw, (d) => {
        if (!state.selectedFeature) {
          return;
        }
        d.get(state.selectedFeature);
      });
      if (!exists) {
        return;
      }

      safeDrawInvoke(state.draw, (d) => {
        if (!state.selectedFeature) {
          return;
        }
        d.changeMode("simple_select", { featureIds: [state.selectedFeature] });
      });
    }
  }, [state.draw, map?.loaded, state.selectedFeature]);

  if (state.activeLayer === undefined) {
    return;
  }

  return (
    <DrawControl
      onSelectionChange={onSelectionChange}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onCombine={onCombine}
      position="top-right"
      displayControlsDefault={true}
      styles={createMapStyle({ forDraw: true })}
      controls={{
        polygon: true,
        trash: true,
        point: true,
        line_string: true,
        combine_features: false,
        uncombine_features: false,
      }}
      boxSelect={false}
      clickBuffer={10}
      defaultMode="simple_select"
      modes={modes}
      userProperties={true}
      activeLayer={state.activeLayer}
    />
  );
}

function InactiveLayers(props: { layers: Layer[] }) {
  const { layers } = props;

  return (
    <>
      {layers.map((l) => (
        <InactiveLayer key={l.id} id={l.id} featureCollection={layerToFeatureCollection(l)} />
      ))}
    </>
  );
}
function InactiveLayer(props: { featureCollection: FeatureCollection; id: string }) {
  const { featureCollection, id } = props;

  return (
    <>
      <EnrichedSymbolSource id={id} featureCollection={featureCollection} />
      <Source key={id} id={id} type="geojson" data={featureCollection}>
        {createMapStyle({ forDraw: false }).map((s) => (
          <MapLayer {...s} key={s.id} id={`${s.id}-${id}`} />
        ))}
      </Source>
    </>
  );
}

function MapWithProvder() {
  const { incidentId } = useParams();
  const { state: { incident, loadedForId } } = useContext(IncidentContext);

  if (loadedForId === incidentId && incident === null) {
    return <Navigate to="/incident/list" replace />;
  }

  return (
    <MapStyleProvider>
      <MapProvider>
        <LayersProvider>
          <MapView />
          <LayerFetcher />
        </LayersProvider>
      </MapProvider>
    </MapStyleProvider>
  );
}

export { MapWithProvder as Map };

export interface FeatureEvent {
  features: Feature<Geometry, GeoJsonProperties>[];
  /** "featureDetail" = property-only change; absent or other = geometry change */
  action?: string;
}

export interface CombineFeatureEvent {
  deletedFeatures: Feature<Geometry, GeoJsonProperties>[];
  createdFeatures: Feature<Geometry, GeoJsonProperties>[];
}

// Define a typed interface for the subset of the draw API we use
type DrawLike = {
  deleteAll: () => void;
  set: (fc: FeatureCollection) => void;
  changeMode: (mode: string, opts?: { featureIds?: string[] }) => void;
  get: (id: string) => Feature | undefined;
  delete: (ids: string[]) => void;
};

// Runtime type guard to check if an object implements DrawLike
function isDrawLike(obj: unknown): obj is DrawLike {
  return (
    obj !== null &&
    typeof obj === "object" &&
    typeof (obj as { deleteAll?: unknown }).deleteAll === "function" &&
    typeof (obj as { set?: unknown }).set === "function" &&
    typeof (obj as { changeMode?: unknown }).changeMode === "function" &&
    typeof (obj as { get?: unknown }).get === "function"
  );
}

// Helper to safely invoke operations on the draw instance.
// Returns true if invocation happened, false otherwise.
function safeDrawInvoke(draw: unknown, fn: (d: DrawLike) => void): boolean {
  if (!isDrawLike(draw)) {
    // eslint-disable-next-line no-console
    console.debug("Draw control missing expected methods; skipping operation.");
    return false;
  }
  try {
    fn(draw);
    return true;
  } catch (e) {
    // swallow errors coming from an invalid draw instance (e.g., transient state in Strict Mode)
    // eslint-disable-next-line no-console
    console.debug("Draw control operation failed:", e);
    return false;
  }
}
