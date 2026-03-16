import "./control-panel.css";
import "./Map.scss";
import { useMutation, useQuery, useReactiveVar } from "@apollo/client/react";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import bbox from "@turf/bbox";
import classNames from "classnames";
import EnrichedLayerFeatures, { EnrichedSymbolSource } from "components/map/EnrichedLayerFeatures";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { first, isEqual } from "lodash";
import maplibregl from "maplibre-gl";
import { useCallback, useContext, useEffect, useState } from "react";
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
import type {
  AddFeatureResponse,
  AddFeatureVars,
  DeleteFeatureResponse,
  DeleteFeatureVars,
  GetLayersData,
  GetLayersVars,
  Layer,
  ModifyFeatureResponse,
  ModifyFeatureVars,
} from "types/layer";
import { v3 as uuidv3, validate as validateUUID } from "uuid";
import ActiveWMSLayers from "./ActiveWMSLayers";
import { BabsIconController } from "./controls/BabsIconController";
import DrawControl from "./controls/DrawControl";
import ExportControl from "./controls/ExportControl";
import LayerControl from "./controls/LayerControl";
import SearchControl from "./controls/Searchbox";
import { StyleController, selectedStyle } from "./controls/StyleController";
import { AddFeatureToLayer, DeleteFeature, GetLayers, ModifyFeature } from "./graphql";
import { LayerContext, LayersProvider } from "./LayerContext";
import { createMapStyle } from "./styleGenerator";
import { CleanFeature, FilterActiveFeatures, LayerToFeatureCollection } from "./utils";

// Initialize maplibregl globals once at module load to avoid repeated side-effects
// when React Strict Mode mounts components multiple times in development.
try {
  // guard in case these methods are not present in some environments
  if (typeof maplibregl?.setMaxParallelImageRequests === "function") {
    maplibregl.setMaxParallelImageRequests(150);
  }
  if (typeof maplibregl?.setWorkerCount === "function") {
    maplibregl.setWorkerCount(6);
  }
} catch (e) {
  console.error("Error setting maplibregl globals:", e);
}

const modes = {
  ...MapboxDraw.modes,
};

function MapView() {
  const mapStyle = useReactiveVar(selectedStyle);

  const mapClass = classNames({
    "is-flex-grow-1": true,
    "is-align-items-stretch": true,
    "is-align-self-strech": true,
    "mt-3": true,
    "theme-light": true,
  });

  return (
    <div className={mapClass} data-theme="light">
      <MapClass
        mapLib={maplibregl}
        initialViewState={{
          latitude: 46.87148,
          longitude: 8.62994,
          zoom: 5,
          bearing: 0,
        }}
        attributionControl={false}
        minZoom={9}
        maxZoom={19}
        mapStyle={mapStyle.style}
        scrollZoom={true}
        reuseMaps={false}
        RTLTextPlugin={undefined}
      >
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

  const { data, loading } = useQuery<GetLayersData, GetLayersVars>(GetLayers, {
    variables: { incidentId: incidentId || "" },
    pollInterval: 2000,
    fetchPolicy: "cache-and-network",
  });

  useEffect(() => {
    if (!loading && data) {
      const stateLayers = state.layers.map((l) => l.layer);
      if (!isEqual(data.layers, stateLayers)) {
        dispatch({ type: "SET_LAYERS", payload: { layers: data.layers } });
      }
    }
  }, [data, dispatch, loading, state.layers]);

  return null;
}

function ActiveLayer() {
  const [initialized, setInitalized] = useState(false);
  const { current: map } = useMap();
  const { state } = useContext(LayerContext);
  const featureCollection = LayerToFeatureCollection(
    first(state.layers.filter((l) => l.layer.id === state.activeLayer).map((l) => l.layer)),
  );

  useEffect(() => {
    const fc = FilterActiveFeatures(featureCollection);
    if (initialized || !map?.loaded) {
      return;
    }
    // only run this for the initialization as we don't want to continously
    // change the map viewport on new features
    if (map !== undefined && fc.features.length > 0) {
      const bboxArray = bbox(fc);
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
      setInitalized(true);
    }
  }, [featureCollection, map, initialized]);

  return (
    <>
      <Draw />
      <EnrichedLayerFeatures
        id={state.activeLayer}
        featureCollection={featureCollection}
        selectedFeature={state.selectedFeature}
      />
    </>
  );
}

function Draw() {
  const { state, dispatch } = useContext(LayerContext);
  const { incidentId } = useParams();
  const { current: map } = useMap();

  const [addFeature] = useMutation<AddFeatureResponse, AddFeatureVars>(AddFeatureToLayer, {
    refetchQueries: [{ query: GetLayers, variables: { incidentId: incidentId } }],
    onCompleted: (data) => {
      if (data.insertFeaturesOne?.id) {
        dispatch({
          type: "SELECT_FEATURE",
          payload: { id: data.insertFeaturesOne.id.toString() },
        });
      }
    },
    onError: (error) => {
      console.error("Error adding feature:", error);
    },
    optimisticResponse: (vars) => {
      return {
        __typename: "Mutation",
        insertFeaturesOne: {
          __typename: "Feature",
          id: vars.id,
          geometry: { ...vars.geometry, __typename: "Geometry" },
          properties: { ...vars.properties, __typename: "Properties" },
          createdAt: new Date(),
          updatedAt: null,
          deletedAt: null,
        },
      };
    },
  });

  const [modifyFeature] = useMutation<ModifyFeatureResponse, ModifyFeatureVars>(ModifyFeature, {
    refetchQueries: [{ query: GetLayers, variables: { incidentId: incidentId } }],
    onError: (error) => {
      console.error("Error adding feature:", error);
    },
    optimisticResponse: (vars, { IGNORE }) => {
      if (vars.properties?.deletedAt) {
        return IGNORE;
      }
      return {
        __typename: "Mutation",
        updateFeaturesByPk: {
          __typename: "Feature",
          id: vars.id,
          geometry: { ...vars.geometry, __typename: "Geometry" },
          properties: { ...vars.properties, __typename: "Properties" },
          createdAt: vars.properties?.createdAt || new Date(),
          updatedAt: vars.properties?.updatedAt || new Date(),
          deletedAt: null,
        },
      };
    },
  });

  const [deleteFeature] = useMutation<DeleteFeatureResponse, DeleteFeatureVars>(DeleteFeature, {
    refetchQueries: [{ query: GetLayers, variables: { incidentId: incidentId } }],
  });

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
        const feature = CleanFeature(f);

        if (!validateUUID(f.id)) {
          feature.id = uuidv3(f.id?.toString() || "", uuidv3.URL);
        }

        addFeature({
          variables: {
            layerId: layer || "",
            geometry: feature.geometry,
            id: feature.id,
            properties: feature.properties,
          },
        });
        if (f.id !== undefined) {
          state.draw?.delete([f.id.toString()]);
        }
      }
    },
    [addFeature, state.draw],
  );

  const onUpdate = useCallback(
    (e: FeatureEvent) => {
      const updatedFeatures: Feature[] = e.features;
      for (const f of updatedFeatures) {
        const feature = CleanFeature(f);
        modifyFeature({
          variables: {
            id: feature.id,
            geometry: feature.geometry,
            properties: feature.properties,
          },
        });
      }
      dispatch({ type: "DESELECT_FEATURE", payload: null });
    },
    [dispatch, modifyFeature],
  );

  const onDelete = useCallback(
    (e: FeatureEvent) => {
      const deletedFeatures: Feature[] = e.features;
      for (const f of deletedFeatures) {
        const feature = CleanFeature(f);
        deleteFeature({ variables: { id: feature.id, deletedAt: new Date() } });
      }
      dispatch({ type: "DESELECT_FEATURE", payload: null });
    },
    [dispatch, deleteFeature],
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
      const featureCollection: FeatureCollection = FilterActiveFeatures(
        LayerToFeatureCollection(state.layers.find((l) => l.layer.id === state.activeLayer)?.layer),
      );

      safeDrawInvoke(state.draw, (d) => {
        d.deleteAll();
        d.set(featureCollection);
      });
    }
  }, [state.draw, map?.loaded, state.layers, state.activeLayer]);

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
        <InactiveLayer
          key={l.id}
          id={l.id}
          featureCollection={FilterActiveFeatures(LayerToFeatureCollection(l))}
        />
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
  return (
    <MapProvider>
      <LayersProvider>
        <MapView />
        <LayerFetcher />
      </LayersProvider>
    </MapProvider>
  );
}

export { MapWithProvder as Map };

export interface FeatureEvent {
  features: Feature<Geometry, GeoJsonProperties>[];
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
