import "./control-panel.css";
import "./Map.css";
import { setBabsSpriteLang, withBabsSprite } from "@f-eld-ch/babs-sprites";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import bbox from "@turf/bbox";
import { BABS_SPRITE_BASE } from "components/babs/iconResolver";
import EnrichedLayerFeatures, { EnrichedSymbolSource } from "components/map/EnrichedLayerFeatures";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { clsx } from "clsx";
import { first, isEqual, throttle } from "lodash";
import * as maplibre from "maplibre-gl";
import { setMaxParallelImageRequests, setWorkerCount, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { faLocationCrosshairs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
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
import { useParams } from "react-router";
import type { Layer } from "types/layer";
import {
  cleanFeature,
  layerToFeatureCollection,
  useAddFeature,
  useDeleteFeature,
  LIVE_POLL_INTERVAL_MS,
  useLayersForIncident,
  useModifyFeature,
} from "api";
import ActiveWMSLayers from "./ActiveWMSLayers";
import { BabsIconController } from "./controls/BabsIconController";
import DrawControl from "./controls/DrawControl";
import ExportControl from "./controls/ExportControl";
import LayerControl from "./controls/LayerControl";
import SearchControl from "./controls/Searchbox";
import { MapStyleProvider, StyleController, useMapStyle } from "./controls/StyleController";
import { MapTimeContext, type DrawingMessage, type MapTime } from "./MapTimeContext";
import { isPendingFeature, withPendingFeatures } from "./pending";
import { clickableLayerIds } from "./controls/clickableLayers";
import { FeatureSelectionReporter } from "./controls/FeatureSelectionReporter";
import { MapSelectionContext } from "./MapSelectionContext";
import { TimeControl } from "./controls/TimeControl";
import { MessageHighlight, MessageHighlightToggle } from "./controls/MessageHighlight";
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

interface MapViewOptions {
  embedded?: boolean;
  readOnly?: boolean;
  /** Show the map as of this point on the incident timeline; undefined means live. */
  asOf?: Date;
  /** Draw for this message: all changes go to the message map layer and take effect at the message's time. */
  drawingMessage?: DrawingMessage;
  /** Called with the feature the user clicks or selects (undefined when cleared). */
  onFeatureSelect?: (featureId: string | undefined) => void;
  /** Changing this clears the map's feature selection. */
  deselectToken?: number;
  /** Called when something is drawn, changed or deleted for the message (see MapSelection). */
  onDrawingChange?: () => void;
}

function MapView({ embedded = false, readOnly = false }: MapViewOptions) {
  const { selectedStyle: mapStyle } = useMapStyle();
  // The timeline replays the Nachrichtenkarte, so it ships with the operator view.
  const messageMapEnabled = useBooleanFlagValue("new-triage-view", false);
  const timelineEnabled = messageMapEnabled && !embedded && !readOnly;
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

  return (
    <div className={embedded ? "h-full min-h-0" : "mt-[2.75rem] grow"} data-theme="light">
      <MapClass
        mapLib={maplibre}
        style={{ width: "100%", height: "100%" }}
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
        reuseMaps={false}
        RTLTextPlugin={undefined}
      >
        <BabsSpriteLanguage />
        {!readOnly && <SearchControl />}
        <AttributionControl position="bottom-left" compact={true} />
        {!readOnly && <FullscreenControl position={"top-left"} />}
        <NavigationControl position="top-left" showCompass={true} visualizePitch={true} />
        <ScaleControl unit={"metric"} position={"bottom-left"} />
        {!readOnly && <ExportControl position="bottom-left" />}
        <Layers readOnly={readOnly} />
        {timelineEnabled && <TimeControl />}
      </MapClass>
    </div>
  );
}

function Layers({ readOnly = false }: { readOnly?: boolean }) {
  const { state } = useContext(LayerContext);
  const {
    state: { incident },
  } = useContext(IncidentContext);
  const { drawingMessage } = useContext(MapTimeContext);
  const [highlightMessage, setHighlightMessage] = useState(true);
  // The read-only map frames its layer by itself until somebody moves it; the button resumes.
  const [following, setFollowing] = useState(true);
  const activeLayer = incident?.closedAt != null ? undefined : state.activeLayer;
  // Features of layers drawn as plain sources can be clicked; the active layer's selection
  // comes from the draw control.
  const clickLayerIds = clickableLayerIds(
    state.layers
      .filter((l) => l.isVisible && (readOnly || l.layer?.id !== activeLayer))
      .map((l) => l.layer),
    createMapStyle({ forDraw: false }).map((s) => s.id ?? ""),
  );

  return (
    <>
      <div
        // Collapsed, the buttons stay in the corner; an open panel is lifted above the slider.
        className="maplibregl-ctrl-bottom-right mx-2 my-2 flex flex-col gap-1 [&>nav]:mb-[calc(var(--map-timeline-height))]"
      >
        {readOnly && <FollowControl following={following} onFollow={() => setFollowing(true)} />}
        {drawingMessage && (
          <MessageHighlightToggle
            enabled={highlightMessage}
            onToggle={() => setHighlightMessage((v) => !v)}
          />
        )}
        {!readOnly && !drawingMessage?.locked && <LayerControl />}
        <StyleController />
      </div>

      {/* Active Layer */}
      {activeLayer !== undefined && !readOnly && <ActiveLayer />}
      {!readOnly && !drawingMessage?.locked && <BabsIconController />}

      {readOnly ? (
        <ReadOnlyLayers following={following} onUserMove={() => setFollowing(false)} />
      ) : (
        <InactiveLayers
          layers={
            state.layers
              .filter((l) => l.layer?.id !== activeLayer)
              .filter((l) => l.isVisible)
              .map((l) => l.layer) || []
          }
        />
      )}
      {!readOnly && <ActiveWMSLayers />}
      {drawingMessage && (
        <MessageHighlight
          enabled={highlightMessage}
          renderRemoved={(fc) => <InactiveLayer id="message-removed" featureCollection={fc} />}
        />
      )}
      <FeatureSelectionReporter clickLayerIds={clickLayerIds} />
    </>
  );
}

function FollowControl({ following, onFollow }: { following: boolean; onFollow: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="maplibregl-ctrl maplibregl-ctrl-group mb-0! self-end text-black">
      <button
        type="button"
        aria-pressed={following}
        aria-label={t("styleController.autoFrame")}
        title={t("styleController.autoFrame")}
        className={clsx("maplibregl-ctrl-icon", following && "text-primary!")}
        onClick={onFollow}
      >
        <FontAwesomeIcon icon={faLocationCrosshairs} size="lg" />
      </button>
    </div>
  );
}

function ReadOnlyLayers({ following, onUserMove }: { following: boolean; onUserMove: () => void }) {
  const { state, dispatch } = useContext(LayerContext);
  const { current: map } = useMap();
  const visibleLayers = useMemo(
    () =>
      state.layers
        .filter((entry) => entry.isVisible)
        .map((entry) => entry.layer)
        .filter((layer) => layerToFeatureCollection(layer).features.length > 0),
    [state.layers],
  );
  const activeLayer =
    visibleLayers.find((layer) => layer.id === state.activeLayer) ?? visibleLayers[0];

  useEffect(() => {
    if (visibleLayers.length === 0 || activeLayer === undefined) return;
    if (state.activeLayer === activeLayer.id) return;

    dispatch({ type: "SET_ACTIVE_LAYER", payload: { layerId: activeLayer.id } });
  }, [activeLayer, dispatch, state.activeLayer, visibleLayers]);

  // Moves the user makes carry the browser event; the map's own fitBounds does not.
  useEffect(() => {
    if (map === undefined) return;

    const onMoveStart = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) onUserMove();
    };
    map.on("movestart", onMoveStart);

    return () => {
      map.off("movestart", onMoveStart);
    };
  }, [map, onUserMove]);

  useEffect(() => {
    if (visibleLayers.length < 2 || !following) return;

    const timer = setInterval(() => {
      dispatch({
        type: "SET_ACTIVE_LAYER",
        payload: { layerId: nextReadOnlyLayerID(visibleLayers, state.activeLayer) },
      });
    }, READ_ONLY_LAYER_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [dispatch, following, state.activeLayer, visibleLayers]);

  useEffect(() => {
    if (map === undefined || activeLayer === undefined || !following) return;

    const featureCollection = layerToFeatureCollection(activeLayer);
    if (featureCollection.features.length === 0) return;

    const fit = () => {
      const bboxArray = bbox(featureCollection);
      map.fitBounds(
        [
          [bboxArray[0], bboxArray[1]],
          [bboxArray[2], bboxArray[3]],
        ],
        {
          animate: true,
          padding: { top: 40, bottom: 40, left: 40, right: 40 },
        },
      );
    };

    if (map.loaded()) {
      fit();
      return;
    }

    map.once("load", fit);
    return () => {
      map.off("load", fit);
    };
  }, [activeLayer, following, map]);

  return (
    <>
      {activeLayer && (
        <div className="maplibregl-ctrl-top-right pointer-events-none m-2">
          <div className="max-w-64 rounded border border-border bg-bg/95 px-3 py-2 text-sm text-fg shadow-lg backdrop-blur">
            <p className="truncate font-semibold">{activeLayer.name}</p>
            {activeLayer.sourceIncidentName && (
              <p className="mt-0.5 truncate text-xs text-fg-muted">
                {activeLayer.sourceIncidentName}
              </p>
            )}
          </div>
        </div>
      )}
      <InactiveLayers layers={visibleLayers} />
    </>
  );
}

function nextReadOnlyLayerID(layers: Layer[], activeLayerID: string | undefined): string {
  const currentIndex = layers.findIndex((layer) => layer.id === activeLayerID);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % layers.length;

  return layers[nextIndex].id;
}

/** For maps nobody edits live: the operator drawing for a message, and the read-only dashboard map. */
const SLOW_POLL_INTERVAL_MS = 10_000;

// LayerFetcher polls from the layers and sets the layers from remote
function LayerFetcher({ livePollInterval }: { livePollInterval: number }) {
  const { incidentId } = useParams();
  const { dispatch } = useContext(LayerContext);
  const { asOf, drawingMessage } = useContext(MapTimeContext);
  const syncedLayers = useRef<Layer[] | undefined>(undefined);
  const syncedIncidentId = useRef<string | undefined>(undefined);
  const preferredKind = drawingMessage ? "MESSAGE_MAP" : "STANDARD";

  // A fixed point in the past does not change while it is looked at, so it is not polled. The
  // operator's own drawing updates the cache directly; others' arrive on a slow poll.
  const pollInterval = drawingMessage ? SLOW_POLL_INTERVAL_MS : asOf ? 0 : livePollInterval;

  // A pure history view (no drawing) bypasses the cache: its features at that time would
  // otherwise overwrite the current geometry of the same normalized entities.
  const fetchPolicy = asOf && !drawingMessage ? "no-cache" : "cache-and-network";

  const result = useLayersForIncident(incidentId, asOf, { pollInterval, fetchPolicy });
  const remoteLayers = result.status === "ready" ? result.data.layers : undefined;

  useEffect(() => {
    if (remoteLayers === undefined) return;

    if (syncedIncidentId.current === incidentId && isEqual(remoteLayers, syncedLayers.current)) {
      return;
    }

    syncedIncidentId.current = incidentId;
    syncedLayers.current = remoteLayers;
    dispatch({
      type: "SET_LAYERS",
      payload: { layers: remoteLayers, viewedIncidentId: incidentId, preferredKind },
    });
  }, [remoteLayers, dispatch, incidentId, preferredKind]);

  return null;
}

/**
 * How often the live geometry is re-read while a vertex is being dragged. Comfortably below
 * a frame budget, and still fast enough that the indicator reads as following the cursor.
 */
const LIVE_GEOMETRY_INTERVAL_MS = 80;
const READ_ONLY_LAYER_INTERVAL_MS = 30_000;

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

/**
 * Whether the active layer can be drawn on right now. The message map layer is only drawn on
 * for a message, and a message only draws on it; a map showing the past is for looking, unless
 * it is the one drawn for a message.
 */
function useDrawingAllowed(): boolean {
  const { state } = useContext(LayerContext);
  const { asOf, drawingMessage } = useContext(MapTimeContext);
  const activeLayerKind = state.layers.find((l) => l.layer.id === state.activeLayer)?.layer.kind;
  const onMessageMap = activeLayerKind === "MESSAGE_MAP";
  const viewingPast = asOf !== undefined && drawingMessage === undefined;

  return onMessageMap === (drawingMessage !== undefined) && !viewingPast && !drawingMessage?.locked;
}

function ActiveLayer() {
  const fittedLayer = useRef<string | undefined>(undefined);
  const { current: map } = useMap();
  const { state } = useContext(LayerContext);
  const { drawingMessage } = useContext(MapTimeContext);
  const { incidentId } = useParams();
  const activeLayer = useMemo(
    () => first(state.layers.filter((l) => l.layer.id === state.activeLayer).map((l) => l.layer)),
    [state.layers, state.activeLayer],
  );
  const isOwnLayer = activeLayer?.sourceIncidentId === incidentId;
  const drawingAllowed = useDrawingAllowed();
  const featureCollection = useMemo(
    () => withPendingFeatures(activeLayer, state.pendingFeatures),
    [activeLayer, state.pendingFeatures],
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
    // Drawing for a message frames what the message did instead (see MessageHighlight).
    if (drawingMessage !== undefined || fittedLayer.current === state.activeLayer || !map?.loaded) {
      return;
    }

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
      fittedLayer.current = state.activeLayer;
    }
  }, [drawingMessage, featureCollection, map, state.activeLayer]);

  if (state.activeLayer === undefined) {
    return null;
  }

  // Only the draw control paints the active layer's features, so a layer that cannot be
  // drawn on right now is shown like any other passive layer instead of vanishing.
  if (!isOwnLayer || !drawingAllowed) {
    return <InactiveLayer id={state.activeLayer} featureCollection={featureCollection} />;
  }

  return (
    <>
      <Draw />
      <EnrichedLayerFeatures id={state.activeLayer} featureCollection={liveCollection} />
    </>
  );
}

function Draw() {
  const { state, dispatch } = useContext(LayerContext);
  const {
    state: { incident },
  } = useContext(IncidentContext);
  const { incidentId } = useParams();
  const { current: map } = useMap();
  const { asOf, drawingMessage } = useContext(MapTimeContext);
  const { onDrawingChange } = useContext(MapSelectionContext);
  // Changes for a message take effect at the message's time (the server derives it from the id).
  // Free drawing takes effect now; a new feature can be given a time when it is saved.
  const change = useMemo(
    () => (drawingMessage ? { messageId: drawingMessage.id } : undefined),
    [drawingMessage],
  );

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

        // Free drawing: the feature stays local until it is saved (with the time it should
        // take effect at). It remains in the draw control, which keeps it selected, so the
        // symbol picker and the save popup open on it.
        if (drawingMessage === undefined && f.id !== undefined) {
          dispatch({
            type: "ADD_PENDING_FEATURE",
            payload: {
              feature: {
                id: f.id.toString(),
                layerId: layer,
                geometry: feature.geometry,
                properties: feature.properties,
              },
            },
          });
          dispatch({ type: "SELECT_FEATURE", payload: { id: f.id.toString() } });

          continue;
        }

        // Drawing for a message: created at once, at the message's time.
        onDrawingChange?.();
        void addFeature({
          layerId: layer,
          geometry: feature.geometry,
          clientKey: String(f.id ?? ""),
          properties: feature.properties,
          incidentId: incidentId ?? "",
          change,
          asOf,
        }).then(({ featureId }) => {
          dispatch({ type: "SELECT_FEATURE", payload: { id: featureId } });
        });

        if (f.id !== undefined) {
          state.draw?.delete([f.id.toString()]);
        }
      }
    },
    [addFeature, asOf, change, dispatch, drawingMessage, incidentId, onDrawingChange, state.draw],
  );

  const onUpdate = useCallback(
    (e: FeatureEvent) => {
      const isPropertyOnly = e.action === "featureDetail";
      const isGeometryOnly = e.action === "reverseDirection";
      const updatedFeatures: Feature[] = e.features;
      for (const f of updatedFeatures) {
        const feature = cleanFeature(f);

        // Not saved yet: the edit only changes the local copy.
        if (isPendingFeature(state.pendingFeatures, feature.id?.toString())) {
          dispatch({
            type: "UPDATE_PENDING_FEATURE",
            payload: {
              id: String(feature.id),
              geometry: isPropertyOnly ? undefined : feature.geometry,
              properties: isGeometryOnly ? undefined : feature.properties,
            },
          });

          continue;
        }

        if (drawingMessage) onDrawingChange?.();

        void modifyFeature({
          id: String(feature.id ?? ""),
          geometry: isPropertyOnly ? undefined : feature.geometry,
          properties: isGeometryOnly ? undefined : feature.properties,
          currentGeometry: feature.geometry,
          currentProperties: feature.properties,
          incidentId: incidentId ?? "",
          change: e.effectiveAt ? { effectiveAt: e.effectiveAt } : change,
          asOf,
        });
      }
    },
    [
      asOf,
      change,
      dispatch,
      drawingMessage,
      incidentId,
      modifyFeature,
      onDrawingChange,
      state.pendingFeatures,
    ],
  );

  const onDelete = useCallback(
    (e: FeatureEvent) => {
      const deletedFeatures: Feature[] = e.features;
      for (const f of deletedFeatures) {
        const feature = cleanFeature(f);

        // Not saved yet: it never existed on the server, so dropping the local copy is all.
        if (isPendingFeature(state.pendingFeatures, feature.id?.toString())) {
          dispatch({ type: "REMOVE_PENDING_FEATURE", payload: { id: String(feature.id) } });

          continue;
        }

        if (drawingMessage) onDrawingChange?.();

        void deleteFeature({
          id: String(feature.id ?? ""),
          incidentId: incidentId ?? "",
          change,
          asOf,
        });
      }
      dispatch({ type: "DESELECT_FEATURE", payload: null });
    },
    [
      asOf,
      change,
      dispatch,
      deleteFeature,
      drawingMessage,
      incidentId,
      onDrawingChange,
      state.pendingFeatures,
    ],
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
      const featureCollection: FeatureCollection = withPendingFeatures(
        state.layers.find((l) => l.layer.id === state.activeLayer)?.layer,
        state.pendingFeatures,
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
  }, [
    state.draw,
    map?.loaded,
    state.layers,
    state.activeLayer,
    state.selectedFeature,
    state.pendingFeatures,
  ]);

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

  if (incident?.closedAt != null || state.activeLayer === undefined) {
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

function MapWithProvder({
  asOf,
  drawingMessage,
  onFeatureSelect,
  deselectToken,
  onDrawingChange,
  ...options
}: MapViewOptions) {
  // A map without a fixed time can be moved along the timeline by its own slider.
  const [timelineAsOf, setTimelineAsOf] = useState<Date | undefined>();
  const hasTimeline = asOf === undefined && drawingMessage === undefined;

  const asOfTime = (asOf ?? timelineAsOf)?.getTime();
  const messageId = drawingMessage?.id;
  const messageTime = drawingMessage?.time.getTime();
  const messageLocked = drawingMessage?.locked;
  // Memoized on the values, so a parent re-render with equal dates does not refetch the layers.
  const mapTime = useMemo<MapTime>(
    () => ({
      asOf: asOfTime === undefined ? undefined : new Date(asOfTime),
      setAsOf: hasTimeline ? setTimelineAsOf : undefined,
      drawingMessage:
        messageId === undefined || messageTime === undefined
          ? undefined
          : { id: messageId, time: new Date(messageTime), locked: messageLocked },
    }),
    [asOfTime, hasTimeline, messageId, messageTime, messageLocked],
  );

  const selection = useMemo(
    () => ({ onSelect: onFeatureSelect, deselectToken, onDrawingChange }),
    [onFeatureSelect, deselectToken, onDrawingChange],
  );

  return (
    <MapStyleProvider>
      <MapProvider>
        <LayersProvider>
          <MapTimeContext.Provider value={mapTime}>
            <MapSelectionContext.Provider value={selection}>
              <MapView {...options} />
              {/* A read-only map (the dashboard) only displays; it does not need the editing cadence. */}
              <LayerFetcher
                livePollInterval={options.readOnly ? SLOW_POLL_INTERVAL_MS : LIVE_POLL_INTERVAL_MS}
              />
            </MapSelectionContext.Provider>
          </MapTimeContext.Provider>
        </LayersProvider>
      </MapProvider>
    </MapStyleProvider>
  );
}

export { MapWithProvder as Map };

export interface FeatureEvent {
  features: Feature<Geometry, GeoJsonProperties>[];
  /** "featureDetail" = property-only change; "reverseDirection" = geometry-only change; absent or other = geometry+properties change */
  action?: string;
  /** When a property edit takes effect on the timeline; absent for "now" (or the message's time). */
  effectiveAt?: Date;
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
    return false;
  }
  try {
    fn(draw);
    return true;
  } catch {
    // swallow errors coming from an invalid draw instance (e.g., transient state in Strict Mode)
    return false;
  }
}
