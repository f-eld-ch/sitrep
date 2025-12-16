import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import parse from "html-react-parser";
import debounce from "lodash/debounce";
import isEmpty from "lodash/isEmpty";
import proj4 from "proj4";
import { useCallback, useId, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { coordinateFromString } from "utils/coordinates";

const BASE_URL = "https://api3.geo.admin.ch/rest/services/api/SearchServer";

interface SearchResult {
  bbox?: number[];
  features: SearchFeature[];
}

interface SearchFeature {
  bbox?: number[];
  geometry: {
    coordinates: number[];
    type: string;
  };
  id?: number | string;
  properties: {
    detail?: string;
    label: string;
    rank?: number;
    type?: string;
    geom_quadindex?: string;
    lat: number;
    lon: number;
    objectclass?: string;
    origin?: string;
    weight?: number;
    x?: number;
    y?: number;
    zoomlevel?: number;
  };
}

function SearchControl() {
  const { current: map } = useMap();
  const [searchResults, setSearchResults] = useState<SearchFeature[]>([]);
  const [input, setInput] = useState<string>("");

  const flyTo = useCallback(
    (target: SearchFeature) => {
      map?.flyTo({
        center: [target.properties.lon, target.properties.lat],
        zoom: 17,
        animate: true,
        duration: 2500,
      });
      setSearchResults([]);
      setInput("");
    },
    [map],
  );

  const search = (input: string) => {
    fetch(
      `${BASE_URL}?${new URLSearchParams({
        searchText: input,
        type: "locations",
        geometryFormat: "geojson",
        origins: "address,gazetteer,parcel",
        limit: "10",
      })}`,
    )
      .then((response) => response.json())
      .then((data) => {
        const searchResult: SearchResult = {
          bbox: data.bbox,
          features: data.features,
        };
        setSearchResults(searchResult.features);
      })
      .catch((error) => {
        console.error("Error:", error);
        setSearchResults([]);
      });
  };

  const executeSearch = (input: string) => {
    try {
      const coord = coordinateFromString(input);
      if (coord) {
        console.log("Flying to coordinate:", coord);
        // reproject the coordinate to WGS84 for maplibre
        const transformed = proj4(
          coord.coordinateSystem.epsg,
          "EPSG:4326",
          coord.coordinate,
        );

        if (transformed) {
          const searchResult: SearchResult = {
            features: [
              {
                geometry: {
                  coordinates: transformed,
                  type: "Point",
                },
                properties: {
                  label: `${coord.coordinateSystem.label} <strong>${coord.coordinate[1].toFixed(3)}, ${coord.coordinate[0].toFixed(3)}</strong>`,
                  detail: "",
                  lat: transformed[1],
                  lon: transformed[0],
                },
              },
            ] as SearchFeature[],
          };
          setSearchResults(searchResult.features);
        }
      } else {
        search(input);
      }
    } catch (error) {
      console.error("Error parsing coordinate:", error);
      search(input);
    }
  };

  const debouncedSearch = debounce(executeSearch, 1000);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    debouncedSearch(value);
  };

  const dropdown = classNames({
    dropdown: true,
    "is-active": !isEmpty(searchResults),
  });

  const id = useId();
  return (
    <div className="is-flex is-justify-content-center	is-align-content-center mt-3">
      <div className={dropdown}>
        <div className="dropdown-trigger">
          <div className="field has-addons">
            <div className="control is-expanded has-icons-left">
              <input
                className="input"
                type="search"
                value={input}
                placeholder=""
                onChange={onChange}
                onKeyDown={(e) => e.key === "Enter" && executeSearch(input)}
              />
              <span className="icon is-left">
                <FontAwesomeIcon icon={faSearch} />
              </span>
            </div>
          </div>
          <div className="dropdown-menu" id={id}>
            <div className="dropdown-content">
              {searchResults?.map((result: SearchFeature) => (
                <a
                  onClick={() => flyTo(result)}
                  key={result.id}
                  className="dropdown-item"
                >
                  {parse(result.properties.label)}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SearchControl;
