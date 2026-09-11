import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import parse from "html-react-parser";
import debounce from "lodash/debounce";
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
        const transformed = proj4(coord.coordinateSystem.epsg, "EPSG:4326", coord.coordinate);

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

  const id = useId();
  return (
    <div className="flex justify-center items-center mt-3">
      <div className="relative">
        <div className="flex">
          <div className="relative flex-1">
            <input
              className="w-full rounded border border-gray-300 pl-9 pr-3 py-1.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              type="search"
              value={input}
              placeholder=""
              onChange={onChange}
              onKeyDown={(e) => e.key === "Enter" && executeSearch(input)}
            />
            <span className="absolute inset-y-0 left-0 w-9 flex items-center justify-center text-gray-400 pointer-events-none text-sm">
              <FontAwesomeIcon icon={faSearch} />
            </span>
          </div>
        </div>
        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 z-50 bg-white border border-gray-200 rounded shadow-lg mt-1" id={id}>
            {searchResults?.map((result: SearchFeature) => (
              <a onClick={() => flyTo(result)} key={result.id} className="block px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer">
                {parse(result.properties.label)}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchControl;
