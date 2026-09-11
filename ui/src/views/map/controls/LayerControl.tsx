import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "maplibre-gl/dist/maplibre-gl.css";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import ActiveLayersControl from "./ActiveLayersControl";
import { MapPanel, MapPanelTabs } from "./MapPanel";
import WMSLayerMenu from "./WMSLayerMenu";

function LayerPanel() {
  const [active, setActive] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("drawing");
  const { t } = useTranslation();

  if (!active) {
    return (
      <div className="maplibregl-ctrl maplibregl-ctrl-group text-black self-end">
        <button type="button" className="maplibregl-ctrl-icon" onClick={() => setActive(true)}>
          <FontAwesomeIcon icon={faLayerGroup} size="lg" />
        </button>
      </div>
    );
  }

  return (
    <MapPanel
      title={t("layerControl.layers")}
      onClose={() => setActive(false)}
      style={{ width: "40vh" }}
    >
      <MapPanelTabs
        tabs={[
          { key: "drawing", label: t("layerControl.drawingLayers") },
          { key: "wms", label: t("layerControl.wmsLayers") },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />
      {activeTab === "drawing" && <ActiveLayersControl />}
      {activeTab === "wms" && <WMSLayerMenu />}
    </MapPanel>
  );
}

export default React.memo(LayerPanel);
