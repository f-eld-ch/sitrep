import { faMap } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import React, { createContext, useCallback, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPanel, MapPanelBlock } from "./MapPanel";
import { useSatelliteAvailable } from "./satelliteAvailability";
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import basisKarte from "assets/map/styles/ch.swisstopo.leichte-basiskarte.vt.json";
import basisKarteImagery from "assets/map/styles/ch.swisstopo.leichte-basiskarte-imagery.vt.json";

interface MapStyle {
  name: string;
  style: StyleSpecification;
  /** Needs swisstopo online: there are no offline tiles for it (the satellite imagery). */
  onlineOnly?: boolean;
}

function ExpandRelativeURLs(previousStyle: StyleSpecification): StyleSpecification {
  const convertToAbsoluteURL = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    if (url.startsWith("http")) return url;

    const absoluteURL = new URL(url, window.location.href).toString();
    return absoluteURL.replace("%7Brange%7D", "{range}").replace("%7Bfontstack%7D", "{fontstack}");
  };

  // Source URLs (TileJSON) are fetched by the map; make same-origin ones absolute like glyphs and
  // sprites. The backend emits absolute tile URLs inside the TileJSON itself.
  const sources = Object.fromEntries(
    Object.entries(previousStyle.sources ?? {}).map(([name, source]) => [
      name,
      "url" in source && typeof source.url === "string" && !source.url.startsWith("http")
        ? { ...source, url: new URL(source.url, window.location.href).href }
        : source,
    ]),
  ) as StyleSpecification["sources"];

  return {
    ...previousStyle,
    sources,
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
    onlineOnly: true,
  },
];

interface MapStyleContextValue {
  selectedStyle: MapStyle;
  setSelectedStyle: (s: MapStyle) => void;
  /** False while the online-only maps (the satellite map) cannot be loaded. */
  onlineMapsAvailable: boolean;
}

const MapStyleContext = createContext<MapStyleContextValue>({
  selectedStyle: MapStyles[0],
  setSelectedStyle: () => {},
  onlineMapsAvailable: true,
});

export function MapStyleProvider({ children }: { children: React.ReactNode }) {
  const [selectedStyle, setSelectedStyle] = useState<MapStyle>(MapStyles[0]);
  const onlineMapsAvailable = useSatelliteAvailable();

  // The satellite map cannot draw without swisstopo. Go back to the base map, which sitrep can
  // serve itself, instead of leaving a blank map. Adjusting state while rendering (guarded, so it
  // settles at once) instead of in an effect avoids drawing the blank satellite map in between.
  if (selectedStyle.onlineOnly && !onlineMapsAvailable) {
    setSelectedStyle(MapStyles[0]);
  }

  return (
    <MapStyleContext.Provider value={{ selectedStyle, setSelectedStyle, onlineMapsAvailable }}>
      {children}
    </MapStyleContext.Provider>
  );
}

export function useMapStyle(): MapStyleContextValue {
  return useContext(MapStyleContext);
}

function StyleController() {
  const [active, setActive] = useState<boolean>(false);
  const { selectedStyle: style, setSelectedStyle, onlineMapsAvailable } = useMapStyle();
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
      <div className="maplibregl-ctrl maplibregl-ctrl-group mb-0! self-end text-black">
        <button type="button" className={btnClass} onClick={() => setActive(!active)}>
          <FontAwesomeIcon icon={faMap} size="lg" />
        </button>
      </div>
    );
  }

  return (
    <MapPanel title={t("styleController.maps")} onClose={() => setActive(false)}>
      {MapStyles.map((s) => {
        const disabled = !!s.onlineOnly && !onlineMapsAvailable;
        return (
          <MapPanelBlock
            key={s.name}
            active={style.name === s.name}
            onClick={() => onClick(s)}
            disabled={disabled}
            title={disabled ? t("styleController.notAvailableOffline") : undefined}
          >
            <span
              className={`capitalize ${style.name === s.name ? "text-primary font-semibold" : ""}`}
            >
              {t(`styleController.${s.name}`)}
            </span>
            {disabled && (
              <span className="ml-2 text-[11px]">({t("styleController.notAvailableOffline")})</span>
            )}
          </MapPanelBlock>
        );
      })}
    </MapPanel>
  );
}

const memoController = React.memo(StyleController);

export { memoController as StyleController };
