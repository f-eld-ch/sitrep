import classNames from "classnames";
import type React from "react";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LayerContext } from "../LayerContext";

interface Layer {
  name: string;
  title: string;
  key: string;
}

const WMS_SERVERS = [
  { name: "geo.admin.ch", url: "https://wms.geo.admin.ch" },
  { name: "geo.ur.ch", url: "https://geo.ur.ch/wms" },
  { name: "sitn.ne.ch", url: "https://sitn.ne.ch/services/wms" },
  { name: "map.geo.sz.ch", url: "https://map.geo.sz.ch/mapserv_proxy" },
];

const getBaseDomain = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch (error) {
    console.error("Invalid URL:", error);
    return url;
  }
};

const WMSLayerMenu = (props: { disable: () => void }) => {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<string>(
    WMS_SERVERS[0].url,
  );
  const [customServer, setCustomServer] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [serverLayersCache, setServerLayersCache] = useState<
    Record<string, Layer[]>
  >({});
  const { dispatch } = useContext(LayerContext);
  const { disable } = props;
  const { t } = useTranslation();

  useEffect(() => {
    if (selectedServer && !serverLayersCache[selectedServer]) {
      setIsLoading(true);
      fetch(
        `${selectedServer}?&SERVICE=WMS&VERSION=1.3.0&request=getCapabilities`,
      )
        .then((response) => response.text())
        .then((data) => {
          const parser = new DOMParser();
          const xml = parser.parseFromString(data, "text/xml");
          const layerElements = xml.getElementsByTagName("Layer");
          const layers = Array.from(layerElements).map((layer, index) => ({
            name: layer.getElementsByTagName("Name")[0].textContent || "",
            title: layer.getElementsByTagName("Title")[0].textContent || "",
            key: `${layer.getElementsByTagName("Name")[0].textContent || ""}-${index}`,
          }));
          setLayers(layers);
          setServerLayersCache((prevCache) => ({
            ...prevCache,
            [selectedServer]: layers,
          }));
          setIsLoading(false);
        })
        .catch((error) => {
          console.error("Error fetching WMS layers:", error);
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
    <div className="panel-block is-align-items-flex-start is-justify-content-space-between">
      <div className="columns">
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
    </div>
  );
};

export default WMSLayerMenu;
