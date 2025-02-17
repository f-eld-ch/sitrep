import { makeVar, useReactiveVar } from "@apollo/client";
import { faMap } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import React, { useCallback, useState } from "react";
import "./StyleController.scss";
import { StyleSpecification } from "maplibre-gl";
import basisKarte from "assets/map/styles/ch.swisstopo.leichte-basiskarte.vt.json";
import basisKarteImagery from "assets/map/styles/ch.swisstopo.leichte-basiskarte-imagery.vt.json";

const MapStyles: MapStyle[] = [
  {
    name: "Basiskarte",
    style: ExpandRelativeURLs(basisKarte as StyleSpecification),
  },
  {
    name: "Satellit",
    style: ExpandRelativeURLs(basisKarteImagery as StyleSpecification),
  },
];

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
                url: s.url.startsWith("http") ? s.url?.toString() : new URL(s.url, window.location.href).href,
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

  const btnClass = classNames({
    "maplibregl-ctrl-icon": true,
    active: active,
    "is-hidden": active,
  });

  const switcherClass = classNames({
    "maplibregl-style-list": true,
    "maplibregl-ctrl-icon": true,
    "is-hidden": !active,
  });

  const onClick = useCallback(
    (u: MapStyle) => {
      console.log("selected map style", u);
      setActive(false);
      selectedStyle(u);
    },
    [setActive],
  );

  return (
    <div className="maplibregl-ctrl maplibregl-ctrl-group has-text-black">
      <button type="button" className={btnClass} onClick={() => setActive(!active)}>
        <FontAwesomeIcon icon={faMap} size="lg" />
      </button>
      <div className={switcherClass}>
        {MapStyles.map((s) => {
          return (
            <button
              type="button"
              className={classNames({ button: true, active: style.name === s.name })}
              key={s.name}
              onClick={() => onClick(s)}
            >
              {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const memoController = React.memo(StyleController);

export { memoController as StyleController };
