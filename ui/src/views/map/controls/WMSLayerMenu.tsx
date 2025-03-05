import classNames from "classnames";
import type React from "react";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LayerContext } from "../LayerContext";
import WMSCapabilities from "ol/format/WMSCapabilities";


const NO_LAYERS_FOUND_ERROR = new Error("wmsLayerMenu.noLayersFound");
const FETCH_LAYERS_ERROR = new Error("wmsLayerMenu.errorFetchingLayers");

type WMSLayerMenuError = typeof NO_LAYERS_FOUND_ERROR | typeof FETCH_LAYERS_ERROR;

interface Layer {
  legendURL: string | undefined;
  name: string;
  title: string;
  key: string;
}

const getBaseDomain = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch (error) {
    console.error("Invalid URL:", error);
    return url;
  }
};

interface WMSLayer {
  Name: string;
  Title: string;
  CRS: string[];
  Layer?: WMSLayer[];
  Style?: {
    LegendURL?: {
      OnlineResource: string;
    }[];
  }[];
  legendURL?: string;
}

const extractLayers = (layer: WMSLayer, server: string): WMSLayer[] => {
  let layers: WMSLayer[] = [];
  if (layer.Layer) {
    for (const subLayer of layer.Layer) {
      layers = layers.concat(extractLayers(subLayer, server));
    }
  } else {
    const legendURL = layer.Style?.[0]?.LegendURL?.[0]?.OnlineResource;
    layers.push({ ...layer, legendURL: legendURL ? legendURL : undefined });
  }
  return layers;
};

const WMSLayerMenu = (props: { disable: () => void }) => {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<string>("");
  const [customServer, setCustomServer] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [serverLayersCache, setServerLayersCache] = useState<
    Record<string, Layer[]>
  >({});
  const [error, setError] = useState<WMSLayerMenuError | null>(null);
  const { dispatch } = useContext(LayerContext);
  const { disable } = props;
  const { t, i18n } = useTranslation();

  const languageMap: Record<string, string> = {
    de: "ger",
    fr: "fra",
    it: "ita",
    en: "ger",
  };

  const language = languageMap[i18n.language] || "ger";

  const WMS_SERVERS = [
    { name: t("mapview.Gefahrenkarte"), url: `https://geodienste.ch/db/gefahrenkarten_v1_3_0/${language}` },
    { name: "geo.admin.ch", url: "https://wms.geo.admin.ch" },
  ];

  useEffect(() => {
    const initialServer = WMS_SERVERS[0].url;
    setSelectedServer(initialServer);
  }, [WMS_SERVERS[0].url]);

  useEffect(() => {
    if (selectedServer && !serverLayersCache[selectedServer]) {
      setIsLoading(true);
      setError(null);
      fetch(
        `${selectedServer}?&SERVICE=WMS&VERSION=1.3.0&request=getCapabilities&parameterlang=${i18n.language}`
      )
        .then((response) => response.text())
        .then((data) => {
          const parser = new WMSCapabilities();
          const result = parser.read(data);
          const allLayers = extractLayers(result.Capability.Layer, selectedServer);
          const layers = allLayers.filter((layer: WMSLayer) => {
            const hasEPSG3857 = layer.CRS?.includes("EPSG:3857") || result.Capability.Layer.CRS?.includes("EPSG:3857");
            return hasEPSG3857;
          }).map((layer: WMSLayer, index: number) => ({
            name: layer.Name,
            title: layer.Title,
            key: `${layer.Name}-${index}`,
            legendURL: layer.legendURL,
          })).sort((a, b) => a.title.localeCompare(b.title));
          if (layers.length === 0) {
            throw NO_LAYERS_FOUND_ERROR;
          }
          setLayers(layers);
          setServerLayersCache((prevCache) => ({
            ...prevCache,
            [selectedServer]: layers,
          }));
          setIsLoading(false);
        })
        .catch((error) => {
          if (error !== NO_LAYERS_FOUND_ERROR) {
            setError(FETCH_LAYERS_ERROR)
          } else {
            setError(error);
          }
          setLayers([]);
          setIsLoading(false);
        });
    } else if (serverLayersCache[selectedServer]) {
      setLayers(serverLayersCache[selectedServer]);
    }
  }, [selectedServer, serverLayersCache]);

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
          server: selectedServer,
          legendURL: layer.legendURL,
        },
      });
      disable();
    }
  };

  const handleServerSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedServer(event.target.value);
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
      setSelectedServer(customServer);
      WMS_SERVERS.push({ name: baseDomain, url: customServer });
      setCustomServer("");
    }
  };

  return (
    <div className="panel-block is-align-items-flex-start is-justify-content-space-between is-flex-direction-column">
      <div className="columns is-multiline">
        <div className="column">
          <div className="select is-small">
            <select
              className="mb-2"
              onChange={handleServerSelect}
              value={selectedServer}
            >
              {WMS_SERVERS.map((server) => (
                <option key={server.url} value={server.url}>
                  {server.name}
                </option>
              ))}
              <option value="">{t("wmsLayerMenu.customServer")}</option>
            </select>
          </div>
        </div>

        {selectedServer === "" && (
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
        {selectedServer && (
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
                {layers.map((layer) => (
                  <option key={layer.key} value={layer.name}>
                    {layer.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {
        error && (
          <div className="columns is-flex-grow-1" >
            <div className="column is-full">
              <div className="notification is-danger" style={{ width: "100%" }}>
                <button type="button" className="delete is-align-self-flex-end" onClick={() => setError(null)} />
                {error === NO_LAYERS_FOUND_ERROR && t("mapview.wmsLayerMenu.noLayersFound")}
                {error === FETCH_LAYERS_ERROR && t("mapview.wmsLayerMenu.errorFetchingLayers")}
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default WMSLayerMenu;
