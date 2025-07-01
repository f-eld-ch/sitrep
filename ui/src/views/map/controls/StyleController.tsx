import { makeVar, useReactiveVar } from "@apollo/client";
import { faMap } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import "./StyleController.scss";
import basisKarte from "assets/map/styles/ch.swisstopo.leichte-basiskarte.vt.json";
import basisKarteImagery from "assets/map/styles/ch.swisstopo.leichte-basiskarte-imagery.vt.json";
import type { StyleSpecification } from "maplibre-gl";

export const MapStyles: MapStyle[] = [
  {
    name: "Basiskarte",
    style: ExpandRelativeURLs(basisKarte as StyleSpecification),
  },
  {
    name: "Satellit",
    style: ExpandRelativeURLs(basisKarteImagery as StyleSpecification),
  },
];

function ExpandRelativeURLs(
  previousStyle: StyleSpecification,
): StyleSpecification {
  const convertToAbsoluteURL = (
    url: string | undefined,
  ): string | undefined => {
    if (!url) return undefined;
    if (url.startsWith("http")) return url;

    const absoluteURL = new URL(url, window.location.href).toString();
    return absoluteURL
      .replace("%7Brange%7D", "{range}")
      .replace("%7Bfontstack%7D", "{fontstack}");
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

export const selectedStyle = makeVar<MapStyle>(MapStyles[0]);
export const activeLayer = makeVar<string>("");

interface MapStyle {
  name: string;
  style: StyleSpecification;
}

function StyleController() {
  const [active, setActive] = useState<boolean>(false);

  const style = useReactiveVar(selectedStyle);

  const { t } = useTranslation();

  const btnClass = classNames({
    "maplibregl-ctrl-icon": true,
  });

  const onClick = useCallback((u: MapStyle) => {
    setActive(false);
    selectedStyle(u);
  }, []);

  if (!active) {
    return (
      <div className="maplibregl-ctrl maplibregl-ctrl-group has-text-black is-align-self-flex-end">
        <button
          type="button"
          className={btnClass}
          onClick={() => setActive(!active)}
        >
          <FontAwesomeIcon icon={faMap} size="lg" />
        </button>
      </div>
    );
  }

  return (
    <nav
      className="panel has-background-white is-align-self-flex-end"
      style={{ pointerEvents: "auto" }}
    >
      <p className="panel-heading is-flex is-justify-content-space-between is-align-items-center is-size-6">
        <span className="px-2">{t("styleController.maps")}</span>
        <button
          type="button"
          className="delete is-align-self-flex-end"
          onClick={() => setActive(!active)}
        />
      </p>
      {MapStyles.map((s) => (
        <div key={s.name} className="panel-block is-size-7">
          <a
            className={classNames({ "is-active": style.name === s.name })}
            onClick={() => onClick(s)}
          >
            {s.name}
          </a>
        </div>
      ))}
    </nav>
  );
}

const memoController = React.memo(StyleController);

export { memoController as StyleController };
