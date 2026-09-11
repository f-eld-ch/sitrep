import { faMap } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import React, { createContext, useCallback, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPanel, MapPanelBlock } from "./MapPanel";
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import basisKarte from "assets/map/styles/ch.swisstopo.leichte-basiskarte.vt.json";
import basisKarteImagery from "assets/map/styles/ch.swisstopo.leichte-basiskarte-imagery.vt.json";

interface MapStyle {
  name: string;
  style: StyleSpecification;
}

function ExpandRelativeURLs(previousStyle: StyleSpecification): StyleSpecification {
  const convertToAbsoluteURL = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    if (url.startsWith("http")) return url;

    const absoluteURL = new URL(url, window.location.href).toString();
    return absoluteURL.replace("%7Brange%7D", "{range}").replace("%7Bfontstack%7D", "{fontstack}");
  };

  return {
    ...previousStyle,
    glyphs: convertToAbsoluteURL(previousStyle.glyphs),
    sprite:
      typeof previousStyle.sprite === "string"
        ? previousStyle.sprite.startsWith("http")
          ? previousStyle.sprite
          : new URL(previousStyle.sprite, window.location.href).href
        : Object.assign(
            [],
            previousStyle.sprite?.map((s) => {
              return Object.assign({}, s, {
                url: s.url.startsWith("http")
                  ? s.url?.toString()
                  : new URL(s.url, window.location.href).href,
              });
            }),
          ),
  };
}

export const MapStyles: MapStyle[] = [
  {
    name: "Basiskarte",
    style: ExpandRelativeURLs(basisKarte as unknown as StyleSpecification),
  },
  {
    name: "Satellit",
    style: ExpandRelativeURLs(basisKarteImagery as unknown as StyleSpecification),
  },
];

interface MapStyleContextValue {
  selectedStyle: MapStyle;
  setSelectedStyle: (s: MapStyle) => void;
}

const MapStyleContext = createContext<MapStyleContextValue>({
  selectedStyle: MapStyles[0],
  setSelectedStyle: () => {},
});

export function MapStyleProvider({ children }: { children: React.ReactNode }) {
  const [selectedStyle, setSelectedStyle] = useState<MapStyle>(MapStyles[0]);
  return (
    <MapStyleContext.Provider value={{ selectedStyle, setSelectedStyle }}>
      {children}
    </MapStyleContext.Provider>
  );
}

export function useMapStyle(): MapStyleContextValue {
  return useContext(MapStyleContext);
}

function StyleController() {
  const [active, setActive] = useState<boolean>(false);
  const { selectedStyle: style, setSelectedStyle } = useMapStyle();
  const { t } = useTranslation();

  const btnClass = clsx({
    "maplibregl-ctrl-icon": true,
  });

  const onClick = useCallback(
    (u: MapStyle) => {
      setActive(false);
      setSelectedStyle(u);
    },
    [setSelectedStyle],
  );

  if (!active) {
    return (
      <div className="maplibregl-ctrl maplibregl-ctrl-group text-black self-end">
        <button type="button" className={btnClass} onClick={() => setActive(!active)}>
          <FontAwesomeIcon icon={faMap} size="lg" />
        </button>
      </div>
    );
  }

  return (
    <MapPanel title={t("styleController.maps")} onClose={() => setActive(false)}>
      {MapStyles.map((s) => (
        <MapPanelBlock key={s.name} active={style.name === s.name}>
          <button
            type="button"
            className={`capitalize ${style.name === s.name ? "text-primary font-semibold" : ""}`}
            onClick={() => onClick(s)}
          >
            {t(`styleController.${s.name}`)}
          </button>
        </MapPanelBlock>
      ))}
    </MapPanel>
  );
}

const memoController = React.memo(StyleController);

export { memoController as StyleController };
