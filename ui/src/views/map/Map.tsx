import "./control-panel.css";
import "./Map.scss";
import { AddFeatureToLayer, DeleteFeature, GetLayers, ModifyFeature } from "./graphql";
import {
  AddFeatureResponse,
  AddFeatureVars,
  DeleteFeatureVars,
  GetLayersData,
  GetLayersVars,
  Layer,
  ModifyFeatureResponse,
  ModifyFeatureVars,
} from "types/layer";
import { BabsIconController } from "./controls/BabsIconController";
import { CleanFeature, FilterActiveFeatures, LayerToFeatureCollection } from "./utils";
import { displayStyle, drawStyle } from "./style";
import { Protocol } from "pmtiles";

import { Feature, Geometry, GeoJsonProperties, FeatureCollection } from "geojson";
import { first } from "lodash";
import {
  FullscreenControl,
  Map,
  MapProvider,
  NavigationControl,
  ScaleControl,
  Source,
  useMap,
  Layer as MapLayer,
  AttributionControl,
} from "react-map-gl/maplibre";
import { LayerContext, LayersProvider } from "./LayerContext";
import { StyleController, selectedStyle } from "./controls/StyleController";
import { memo, useCallback, useContext, useEffect, useState } from "react";
import { useMutation, useQuery, useReactiveVar } from "@apollo/client";
import { useParams } from "react-router-dom";
import bbox from "@turf/bbox";
import DrawControl from "./controls/DrawControl";
import EnrichedLayerFeatures, { EnrichedSymbolSource } from "components/map/EnrichedLayerFeatures";
import ExportControl from "./controls/ExportControl";
import LayerControl from "./controls/LayerControl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import maplibregl from "maplibre-gl";
import classNames from "classnames";

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
  });

  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.setMaxParallelImageRequests(150);
    maplibregl.setWorkerCount(6);
    maplibregl.addProtocol("pmtiles", protocol.tile);
    return () => {
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

  return (
    <>
      <div className={mapClass}>
        <Map
          mapLib={maplibregl}
          onLoad={(e) => console.log(e)}
          initialViewState={{
            latitude: 46.87148,
            longitude: 8.62994,
            zoom: 5,
            bearing: 0,
          }}
          attributionControl={false}
          minZoom={9}
          maxZoom={19}
          mapStyle={mapStyle.uri}
          scrollZoom={true}
          reuseMaps={false}
          RTLTextPlugin={undefined}
        >
          <AttributionControl position="bottom-left" compact={true} />
          {/* All Map Controls */}
          <FullscreenControl position={"top-left"} />
          <NavigationControl position={"top-left"} visualizePitch={true} />
          <ScaleControl unit={"metric"} position={"bottom-left"} />
          <ExportControl position="bottom-left" />
          {/* Layersprovider and Draw */}
          <Layers />
        </Map>
      </div>
    </>
  );
}

function Layers() {
  const { state } = useContext(LayerContext);

  return (
    <LayersProvider>
      <LayerFetcher />
      <div className="maplibregl-ctrl-bottom-right">
        <LayerControl />
        <StyleController />
      </div>

      {/* Active Layer */}
      <ActiveLayer />

      {/* Inactive Layers */}
      <InactiveLayers layers={state.layers.filter((l) => l.id !== state.activeLayer) || []} />
    </LayersProvider>
  );
}

// LayerFetcher polls from the layers and sets the layers from remote
function LayerFetcher() {
  const { incidentId } = useParams();
  const { state, dispatch } = useContext(LayerContext);

  const { data, loading } = useQuery<GetLayersData, GetLayersVars>(GetLayers, {
    variables: { incidentId: incidentId || "" },
    pollInterval: 3000,
    fetchPolicy: "cache-and-network",
  });

  useEffect(() => {
    if (!loading && data && data.layers !== state.layers) {
      dispatch({ type: "SET_LAYERS", payload: { layers: data.layers } });
    }
  }, [data, dispatch, loading, state.activeLayer, state.layers]);

  return <></>;
}

function ActiveLayer() {
  const [initialized, setInitalized] = useState(false);
  const { current: map } = useMap();
  const { state } = useContext(LayerContext);
  const featureCollection = LayerToFeatureCollection(first(state.layers.filter((l) => l.id === state.activeLayer)));

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
  }, [featureCollection, map, initialized, setInitalized]);

  return (
    <>
      <MemoDraw activeLayer={state.activeLayer} />
      <EnrichedLayerFeatures
        id={state.activeLayer}
        featureCollection={featureCollection}
        selectedFeature={state.selectedFeature}
      />
      <BabsIconController />
    </>
  );
}

const MemoDraw = memo(Draw);
function Draw(props: { activeLayer: string | undefined }) {
  const { state, dispatch } = useContext(LayerContext);
  const { incidentId } = useParams();
  const { current: map } = useMap();

  const [addFeature] = useMutation<AddFeatureResponse, AddFeatureVars>(AddFeatureToLayer, {
    refetchQueries: [{ query: GetLayers, variables: { incidentId: incidentId } }],
    onCompleted: (data: AddFeatureResponse) => {
      if (data.insertFeaturesOne?.id) {
        dispatch({ type: "SELECT_FEATURE", payload: { id: data.insertFeaturesOne.id.toString() } });
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

  const [deleteFeature] = useMutation<Feature, DeleteFeatureVars>(DeleteFeature, {
    refetchQueries: [{ query: GetLayers, variables: { incidentId: incidentId } }],
  });

  const onSelectionChange = useCallback(
    (e: FeatureEvent) => {
      const features: Feature[] = e.features;
      if (features?.length > 0) {
        const feature = first(features);
        dispatch({ type: "SELECT_FEATURE", payload: { id: feature?.id?.toString() } });
      } else {
        dispatch({ type: "DESELECT_FEATURE", payload: null });
      }
    },
    [dispatch],
  );

  const onCreate = useCallback(
    (e: FeatureEvent) => {
      if (props.activeLayer === undefined) {
        return;
      }

      const createdFeatures: Feature[] = e.features;
      createdFeatures.forEach((f) => {
        const feature = CleanFeature(f);
        addFeature({
          variables: {
            layerId: props.activeLayer || "",
            geometry: feature.geometry,
            id: feature.id,
            properties: feature.properties,
          },
        });
      });
    },
    [props.activeLayer, dispatch, addFeature],
  );

  const onUpdate = useCallback(
    (e: FeatureEvent) => {
      const updatedFeatures: Feature[] = e.features;
      updatedFeatures.forEach((f) => {
        const feature = CleanFeature(f);
        modifyFeature({ variables: { id: feature.id, geometry: feature.geometry, properties: feature.properties } });
      });
      dispatch({ type: "DESELECT_FEATURE", payload: null });
    },
    [dispatch, props.activeLayer, modifyFeature],
  );

  const onDelete = useCallback(
    (e: FeatureEvent) => {
      const deletedFeatures: Feature[] = e.features;
      deletedFeatures.forEach((f) => {
        const feature = CleanFeature(f);
        deleteFeature({ variables: { id: feature.id, deletedAt: new Date() } });
      });
      dispatch({ type: "DESELECT_FEATURE", payload: null });
    },
    [dispatch, props.activeLayer, deleteFeature],
  );

  const onCombine = useCallback(
    (e: CombineFeatureEvent) => {
      onCreate({ features: e.createdFeatures });
      onDelete({ features: e.deletedFeatures });
      dispatch({ type: "DESELECT_FEATURE", payload: null });
    },
    [dispatch, onCreate, onDelete],
  );

  // this is the effect which syncs the drawings
  useEffect(() => {
    if (state.draw && map?.loaded) {
      const featureCollection: FeatureCollection = FilterActiveFeatures(
        LayerToFeatureCollection(state.layers.find((l) => l.id === props.activeLayer)),
      );
      state.draw.deleteAll();
      state.draw.set(featureCollection);
    }
  }, [state.draw, map?.loaded, state.layers, props.activeLayer]);

  // this is the effect which syncs the drawings
  useEffect(() => {
    if (state.draw && map?.loaded) {
      if (state.selectedFeature === undefined) {
        // No feature selected, sync to draw control
        state.draw.changeMode("simple_select");
        return;
      }

      // Check if the selected feature exists in the draw control
      const selectedFeature = state.draw.get(state.selectedFeature);
      if (!selectedFeature) {
        // Selected feature does not (yet) exist in draw control
        return;
      }

      // select the feature in the draw control
      state.draw.changeMode("simple_select", { featureIds: [state.selectedFeature] });
      return;
    }
  }, [state.draw, map?.loaded, state.selectedFeature, state.layers, props.activeLayer]);

  if (props.activeLayer === undefined) {
    return <></>;
  }

  return (
    <>
      <DrawControl
        onSelectionChange={onSelectionChange}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onCombine={onCombine}
        position="top-right"
        displayControlsDefault={true}
        styles={drawStyle}
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
      />
    </>
  );
}

function InactiveLayers(props: { layers: Layer[] }) {
  const { layers } = props;

  return (
    <>
      {layers.map((l) => (
        <InactiveLayer key={l.id} id={l.id} featureCollection={FilterActiveFeatures(LayerToFeatureCollection(l))} />
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
        {displayStyle.map((s) => (
          <MapLayer key={s.id} id={s.id + id} {...s} />
        ))}
      </Source>
    </>
  );
}

function MapWithProvder() {
  return (
    <MapProvider>
      <MapView />
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
