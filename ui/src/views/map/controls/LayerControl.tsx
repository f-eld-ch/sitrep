import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "maplibre-gl/dist/maplibre-gl.css";
import React, { useState } from "react";
import "./LayerControl.scss";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import ActiveLayersControl from "./ActiveLayersControl";
import WMSLayerMenu from "./WMSLayerMenu";

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
      <div className="maplibregl-ctrl maplibregl-ctrl-group has-text-black is-align-self-flex-end">
        <button type="button" className={btnClass} onClick={() => setActive(!active)}>
          <FontAwesomeIcon icon={faLayerGroup} size="lg" />
        </button>
      </div>
    );
  }

  return (
    <nav
      className="panel has-background-white is-align-self-flex-end "
      style={{ pointerEvents: "auto", width: "40vh" }}
    >
      <p className="panel-heading is-flex is-justify-content-space-between is-align-items-center is-size-6">
        {t("layerControl.layers")}
        <button
          type="button"
          className="delete is-align-self-flex-end"
          onClick={() => setActive(!active)}
          aria-label={t("close")}
        />
      </p>

      <div className="panel-tabs is-size-7">
        <a
          className={classNames({ "is-active": activeTab === "drawing" })}
          onClick={() => setActiveTab("drawing")}
        >
          {t("layerControl.drawingLayers")}
        </a>
        <a
          className={classNames({ "is-active": activeTab === "wms" })}
          onClick={() => setActiveTab("wms")}
        >
          {t("layerControl.wmsLayers")}
        </a>
      </div>
      {activeTab === "drawing" && <ActiveLayersControl />}
      {activeTab === "wms" && <WMSLayerMenu />}
    </nav>
  );
}

export default React.memo(LayerPanel);
