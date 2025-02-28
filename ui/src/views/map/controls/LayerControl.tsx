import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "maplibre-gl/dist/maplibre-gl.css";
import React, { useState } from "react";
import "./LayerControl.scss";
import classNames from "classnames";
import WMSLayerMenu from "./WMSLayerMenu";
import ActiveLayersControl from "./ActiveLayersControl";
import { useTranslation } from "react-i18next";

function LayerPanel() {
  const [active, setActive] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("drawing");
  const { t } = useTranslation();

  const btnClass = classNames({
    "maplibregl-ctrl-icon": true,
    active: active,
    "is-hidden": active,
  });

  if (!active) {
    return (
      <div className="maplibregl-ctrl maplibregl-ctrl-group has-text-black my-3">
        <button type="button" className={btnClass} onClick={() => setActive(!active)}>
          <FontAwesomeIcon icon={faLayerGroup} size="lg" />
        </button>
      </div>
    );
  }

  return (
    <nav className="panel has-background-white my-3 mx-2" style={{ pointerEvents: "auto" }}>
      <p className="panel-heading">
        {t("layerControl.layers")}
        <button className="delete is-pulled-right" onClick={() => setActive(!active)}></button>
      </p>
      <div className="panel-tabs">
        <a
          className={classNames({ "is-active": activeTab === "drawing" })}
          onClick={() => setActiveTab("drawing")}
        >
          {t("layerControl.activeLayers")}
        </a>
        <a
          className={classNames({ "is-active": activeTab === "wms" })}
          onClick={() => setActiveTab("wms")}
        >
          {t("layerControl.addWmsLayers")}
        </a>
      </div>
      {activeTab === "drawing" && <ActiveLayersControl />}
      {activeTab === "wms" && <WMSLayerMenu disable={() => { setActiveTab("drawing") }} />}
    </nav >
  );
}

export default React.memo(LayerPanel);
