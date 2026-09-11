import { clsx } from "clsx";
import {
  faEye,
  faEyeSlash,
  faHexagonNodesBolt,
  faInfoCircle,
  faPlus,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import WMSCapabilities from "ol/format/WMSCapabilities";
import type React from "react";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "components/ui";
import {
  LayerContext,
  type WMSLayer as StateLayer,
  type WMSLayer,
  type WMSServer,
} from "../LayerContext";

const NO_LAYERS_FOUND_ERROR = new Error("wmsLayerMenu.noLayersFound");
const FETCH_LAYERS_ERROR = new Error("wmsLayerMenu.errorFetchingLayers");

type WMSLayerMenuError = typeof NO_LAYERS_FOUND_ERROR;

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

const extractLayers = (layer: WMSCapabilitiesLayer, server: string): Layer[] => {
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
    if (state.wms.currentServer && !state.wms.availableLayers[state.wms.currentServer]) {
      /* oxlint-disable react/set-state-in-effect -- Neither is derived state: this is the
         spinner going up and the previous error clearing as a network request starts, which
         is the case effects exist for. Both must be set before the fetch, so there is no
         later point to move them to. */
      setIsLoading(true);
      setError(null);
      /* oxlint-enable react/set-state-in-effect */
      fetch(
        `${state.wms.currentServer}?&SERVICE=WMS&VERSION=1.3.0&request=getCapabilities&parameterlang=${i18n.language}`,
      )
        .then((response) => response.text())
        .then((data) => {
          const parser = new WMSCapabilities();
          const result = parser.read(data);
          const allLayers = extractLayers(result.Capability.Layer, state.wms.currentServer);
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
  }, [state.wms.currentServer, state.wms.availableLayers, i18n.language, dispatch]);

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

  const handleCustomServerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
          className="flex cursor-pointer flex-wrap items-center justify-between border-b border-gray-200 px-3 py-2 text-xs transition-colors last:border-b-0 hover:bg-gray-100"
          onClick={() => handleVisibilityToggle(layer.name, !layer.isVisible)}
        >
          <div className="mr-3 flex flex-1 items-center">
            <span className="mr-3 inline-flex h-[1em] w-[1em] items-center justify-center">
              <FontAwesomeIcon icon={faHexagonNodesBolt} size="lg" />
            </span>
            <span>{layer.title}</span>
          </div>
          <div className="flex shrink-0 flex-row items-center gap-2">
            {layer.legendURL && (
              <button
                className="leading-none transition-colors hover:text-primary"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleInfoToggle(layer.name);
                }}
              >
                <FontAwesomeIcon icon={faInfoCircle} />
              </button>
            )}
            <button
              className="leading-none transition-colors hover:text-primary"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleVisibilityToggle(layer.name, !layer.isVisible);
              }}
            >
              <FontAwesomeIcon icon={layer.isVisible ? faEye : faEyeSlash} />
            </button>
            <input
              className="mx-1"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={layer.opacity}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) =>
                handleWMSOpacityChange(layer.name, Number.parseFloat(e.target.value))
              }
            />
            <button
              className="leading-none transition-colors hover:text-danger"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteLayer(layer.name);
              }}
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
          {expandedLayer === layer.name && (
            <div className="flex items-center justify-center">
              <img src={layer.legendURL} alt={`${layer.title}`} className="w-full" />
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-col items-start border-b border-gray-200 px-3 py-2 last:border-b-0">
        {!showAddLayer && (
          <Button size="sm" variant="primary" onClick={() => setShowAddLayer(true)}>
            <FontAwesomeIcon icon={faPlus} className="mr-2" />
            {t("layerControl.addWMSLayer")}
          </Button>
        )}

        {showAddLayer && (
          <div className="flex w-full flex-wrap gap-2">
            <div className="min-w-0 flex-1">
              <select
                className="mb-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none"
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

            {state.wms.currentServer === "" && (
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  placeholder={t("wmsLayerMenu.enterServerUrl")}
                  value={customServer}
                  onChange={handleCustomServerChange}
                  className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />

                <Button variant="primary" onClick={handleCustomServerSubmit}>
                  {t("wmsLayerMenu.fetchLayers")}
                </Button>
              </div>
            )}
            {state.wms.currentServer && (
              <div className="min-w-0 flex-1">
                <select
                  className={clsx(
                    "w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none",
                    isLoading && "cursor-wait opacity-50",
                  )}
                  onChange={handleLayerSelect}
                  value={selectedLayer || ""}
                >
                  <option value="" disabled>
                    {t("wmsLayerMenu.selectLayer")}
                  </option>
                  {layers.map((layer) => (
                    <option key={layer.name} value={layer.name}>
                      {layer.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="relative mt-2 w-full rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <button
              type="button"
              className="absolute top-2 right-2 text-red-400 hover:text-red-600"
              onClick={() => setError(null)}
              aria-label={t("close")}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
            {error === NO_LAYERS_FOUND_ERROR && t("mapview.wmsLayerMenu.noLayersFound")}
            {error === FETCH_LAYERS_ERROR && t("mapview.wmsLayerMenu.errorFetchingLayers")}
          </div>
        )}
      </div>
    </>
  );
};

export default WMSLayerMenu;
