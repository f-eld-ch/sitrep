import {
  faEye,
  faEyeSlash,
  faHexagonNodesBolt,
  faInfoCircle,
  faPlus,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import WMSCapabilities from "ol/format/WMSCapabilities";
import type React from "react";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LayerContext,
  type WMSLayer as StateLayer,
  type WMSLayer,
  type WMSServer,
} from "../LayerContext";

const NO_LAYERS_FOUND_ERROR = new Error("wmsLayerMenu.noLayersFound");
const FETCH_LAYERS_ERROR = new Error("wmsLayerMenu.errorFetchingLayers");

type WMSLayerMenuError =
  | typeof NO_LAYERS_FOUND_ERROR
  | typeof FETCH_LAYERS_ERROR;

interface Layer {
  legendURL: string | undefined;
  name: string;
  title: string;
  server: string;
  key: string;
  crs: string[];
}

const getBaseDomain = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch (error) {
    console.error("Invalid URL:", error);
    return url;
  }
};

interface WMSCapabilitiesLayer {
  Name: string;
  Title: string;
  CRS: string[];
  Layer?: WMSCapabilitiesLayer[];
  Style?: {
    LegendURL?: {
      OnlineResource: string;
    }[];
  }[];
  legendURL?: string;
}

const extractLayers = (
  layer: WMSCapabilitiesLayer,
  server: string,
): Layer[] => {
  let layers: Layer[] = [];
  const legendURL = layer.Style?.[0]?.LegendURL?.[0]?.OnlineResource;
  layers.push({
    ...layer,
    legendURL: legendURL ? legendURL : undefined,
    name: layer.Name,
    title: layer.Title,
    server,
    key: `${layer.Name}-${server}`,
    crs: layer.CRS,
  });
  // Recursively extract sub-layers if they exist
  if (layer.Layer) {
    for (const subLayer of layer.Layer) {
      layers = layers.concat(extractLayers(subLayer, server));
    }
  }
  return layers;
};

const WMSLayerMenu = () => {
  const [layers, setLayers] = useState<StateLayer[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [customServer, setCustomServer] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<WMSLayerMenuError | null>(null);
  const [showAddLayer, setShowAddLayer] = useState<boolean>(false);
  const { dispatch, state } = useContext(LayerContext);
  const { t, i18n } = useTranslation();

  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);

  const handleVisibilityToggle = (layerName: string, isVisible: boolean) => {
    dispatch({
      type: "TOGGLE_WMS_LAYER_VISIBILITY",
      payload: { layerName, isVisible },
    });

    if (!isVisible) {
      setError(null);
    }
  };

  const handleWMSOpacityChange = (layerName: string, opacity: number) => {
    dispatch({
      type: "UPDATE_WMS_LAYER_OPACITY",
      payload: { layerName, opacity },
    });
  };

  const handleDeleteLayer = (layerName: string) => {
    dispatch({ type: "REMOVE_WMS_LAYER", payload: { layerName } });
  };

  const handleInfoToggle = (layerName: string) => {
    setExpandedLayer(expandedLayer === layerName ? null : layerName);
  };

  useEffect(() => {
    if (
      state.wms.currentServer &&
      !state.wms.availableLayers[state.wms.currentServer]
    ) {
      setIsLoading(true);
      setError(null);
      fetch(
        `${state.wms.currentServer}?&SERVICE=WMS&VERSION=1.3.0&request=getCapabilities&parameterlang=${i18n.language}`,
      )
        .then((response) => response.text())
        .then((data) => {
          const parser = new WMSCapabilities();
          const result = parser.read(data);
          const allLayers = extractLayers(
            result.Capability.Layer,
            state.wms.currentServer,
          );
          const layers = allLayers
            .filter((layer: Layer) => {
              const hasEPSG3857 =
                layer.crs?.includes("EPSG:3857") ||
                result.Capability.Layer.CRS?.includes("EPSG:3857");
              return hasEPSG3857;
            })
            .map((layer: Layer, index: number) => ({
              name: layer.name,
              title: layer.title,
              key: `${layer.name}-${index}`,
              legendURL: layer.legendURL,
              isVisible: true,
              opacity: 1,
              server: state.wms.currentServer,
            }))
            .sort((a, b) => a.title.localeCompare(b.title));
          if (layers.length === 0) {
            throw NO_LAYERS_FOUND_ERROR;
          }
          setLayers(layers);
          dispatch({
            type: "SET_WMS_SERVER_LAYERS_CACHE",
            payload: {
              server: state.wms.currentServer,
              layers: layers,
            },
          });
          setIsLoading(false);
        })
        .catch((error) => {
          if (error !== NO_LAYERS_FOUND_ERROR) {
            setError(FETCH_LAYERS_ERROR);
            dispatch({
              type: "REMOVE_WMS_SERVER",
              payload: {
                server: state.wms.currentServer,
              },
            });
          } else {
            setError(error);
          }
          setLayers([]);
          setIsLoading(false);
        });
    } else if (state.wms.availableLayers[state.wms.currentServer]) {
      const layers = state.wms.availableLayers[state.wms.currentServer].map(
        (layer: StateLayer) => ({
          ...layer,
          isVisible: true,
          opacity: 1,
          server: state.wms.currentServer,
        }),
      );
      setLayers(layers);
    }
  }, [
    state.wms.currentServer,
    state.wms.availableLayers,
    i18n.language,
    dispatch,
  ]);

  const handleLayerSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const layerName = event.target.value;
    const layer = layers.find((l) => l.name === layerName);
    if (layer) {
      setSelectedLayer(layerName);
      dispatch({
        type: "ADD_WMS_LAYER",
        payload: {
          layerName: layerName,
          title: layer.title,
          opacity: 0.7,
          server: state.wms.currentServer,
          legendURL: layer.legendURL,
        },
      });
      setShowAddLayer(false);
      setSelectedLayer(null);
    }
  };

  const handleServerSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch({
      type: "SET_WMS_SERVER",
      payload: { server: event.target.value },
    });
    setCustomServer("");
  };

  const handleCustomServerChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setCustomServer(event.target.value);
  };

  const handleCustomServerSubmit = () => {
    if (customServer) {
      const baseDomain = getBaseDomain(customServer);
      dispatch({
        type: "ADD_CUSTOM_WMS_SERVER",
        payload: { server: { name: baseDomain, url: customServer } },
      });
      setCustomServer(customServer);
    }
  };

  const filteredServers = state.wms.servers.filter(
    (server) => !server.language || server.language === i18n.language,
  );

  return (
    <>
      {state.wms.activeLayers.map((layer: WMSLayer) => (
        <div
          key={layer.name}
          className="panel-block is-align-items-center is-justify-content-space-between is-flex-wrap-wrap is-size-7"
        >
          <div
            className="mr-3 is-align-items-flex-start is-align-content-center is-flex-shrink-2"
            style={{ width: "50%" }}
          >
            <span className="panel-icon" style={{ verticalAlign: "center" }}>
              <FontAwesomeIcon icon={faHexagonNodesBolt} size="lg" />
            </span>
            <span>{layer.title}</span>
          </div>
          <div
            className="is-flex-direction-row	is-align-items-flex-end is-flex-shrink-0 is-flex-wrap-wrap"
            style={{ width: "45%" }}
          >
            {layer.legendURL && (
              <button
                className="mr-2 is-align-self-center"
                type="button"
                onClick={() => handleInfoToggle(layer.name)}
              >
                <FontAwesomeIcon icon={faInfoCircle} />
              </button>
            )}

            <button
              className="mr-2 is-align-self-center"
              type="button"
              onClick={() =>
                handleVisibilityToggle(layer.name, !layer.isVisible)
              }
            >
              <FontAwesomeIcon icon={layer.isVisible ? faEye : faEyeSlash} />
            </button>
            <input
              className="mr-2"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={layer.opacity}
              onChange={(e) =>
                handleWMSOpacityChange(
                  layer.name,
                  Number.parseFloat(e.target.value),
                )
              }
            />
            <button type="button" onClick={() => handleDeleteLayer(layer.name)}>
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
          {expandedLayer === layer.name && (
            <div className="is-align-content-center">
              <img
                src={layer.legendURL}
                alt={`${layer.title}`}
                style={{ width: "100%" }}
              />
            </div>
          )}
        </div>
      ))}
      <div className="panel-block is-align-items-flex-start is-justify-content-space-between is-flex-direction-column">
        {!showAddLayer && (
          <button
            type="button"
            className="button is-small is-rounded"
            onClick={() => setShowAddLayer(true)}
          >
            <FontAwesomeIcon icon={faPlus} className="mr-2" />
            {t("layerControl.addWMSLayer")}
          </button>
        )}

        {showAddLayer && (
          <div className="columns is-multiline">
            <div className="column">
              <div className="select is-small">
                <select
                  className="mb-2"
                  onChange={handleServerSelect}
                  value={state.wms.currentServer}
                >
                  {filteredServers.map((server: WMSServer) => (
                    <option key={server.url} value={server.url}>
                      {server.name}
                    </option>
                  ))}
                  <option value="">{t("wmsLayerMenu.customServer")}</option>
                </select>
              </div>
            </div>

            {state.wms.currentServer === "" && (
              <div className="column">
                <input
                  type="text"
                  placeholder={t("wmsLayerMenu.enterServerUrl")}
                  value={customServer}
                  onChange={handleCustomServerChange}
                  className="input is-small mb-2"
                />

                <button
                  type="button"
                  onClick={handleCustomServerSubmit}
                  className="button is-primary"
                >
                  {t("wmsLayerMenu.fetchLayers")}
                </button>
              </div>
            )}
            {state.wms.currentServer && (
              <div className="column">
                <div
                  className={classNames({
                    select: true,
                    "is-small": true,
                    "is-loading": isLoading,
                  })}
                >
                  <select
                    className="is-align-items-flex-start is-justify-content-space-between"
                    onChange={handleLayerSelect}
                    value={selectedLayer || ""}
                    style={{ width: "100%" }}
                  >
                    <option value="" disabled>
                      {t("wmsLayerMenu.selectLayer")}
                    </option>
                    {layers.map((layer, index) => (
                      <option key={`${layer.name}-${index}`} value={layer.name}>
                        {layer.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="columns is-flex-grow-1">
            <div className="column is-full">
              <div className="notification is-danger" style={{ width: "100%" }}>
                <button
                  type="button"
                  className="delete is-align-self-flex-end"
                  onClick={() => setError(null)}
                />
                {error === NO_LAYERS_FOUND_ERROR &&
                  t("mapview.wmsLayerMenu.noLayersFound")}
                {error === FETCH_LAYERS_ERROR &&
                  t("mapview.wmsLayerMenu.errorFetchingLayers")}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default WMSLayerMenu;
