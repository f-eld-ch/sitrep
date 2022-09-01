
export const style = [
    {
        'id': 'gl-draw-polygon-fill-pattern-inactive',
        'type': 'fill',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Polygon'],
            ['has', 'user_zoneType'],
            ['in', 'user_zoneType', 'Brandzone', 'Zerstoerung'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'fill-pattern': ['match', ['get', 'user_zoneType'], 'Brandzone', 'PatternBrandzone', 'Zerstoerung', 'PatternZerstoert', 'PatternBrandzone'],
            'fill-opacity': 0.5
        }
    },
    {
        'id': 'gl-draw-polygon-fill-inactive',
        'type': 'fill',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Polygon'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'fill-color': ['coalesce', ['get', 'user_color'], '#000000'],
            'fill-outline-color': ['coalesce', ['get', 'user_color'], '#000000'],
            'fill-opacity': 0.1
        }
    },
    {
        'id': 'gl-draw-polygon-fill-active',
        'type': 'fill',
        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
        'paint': {
            'fill-color': '#fbb03b',
            'fill-outline-color': '#fbb03b',
            'fill-opacity': 0.3
        }
    },
    {
        'id': 'gl-draw-polygon-midpoint',
        'type': 'circle',
        'filter': ['all',
            ['==', '$type', 'Point'],
            ['==', 'meta', 'midpoint']],
        'paint': {
            'circle-radius': 4,
            'circle-color': '#fbb03b'
        }
    },
    {
        'id': 'gl-draw-polygon-stroke-inactive',
        'type': 'line',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Polygon'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': ['coalesce', ['get', 'user_color'], '#000000'],
            'line-width': 2
        }
    },
    {
        'id': 'gl-draw-polygon-stroke-active',
        'type': 'line',
        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': '#fbb03b',
            'line-dasharray': [0.2, 2],
            'line-width': 2
        }
    },
    {
        'id': 'gl-draw-line-inactive',
        'type': 'line',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['!has', 'user_lineType'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': ['coalesce', ['get', 'user_color'], '#000000'],
            'line-opacity': 0.7,
            'line-width': 2,
        }
    },
    {
        'id': 'gl-draw-line-inactive-normalLine',
        'type': 'line',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['in', 'user_lineType', '', 'normal'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': ['coalesce', ['get', 'user_color'], '#000000'],
            'line-opacity': 0.7,
            'line-width': 2,
        }
    },
    {
        'id': 'gl-draw-line-inactive-pattern',
        'type': 'line',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['in', 'user_lineType', 'unpassierbar', 'beabsichtigteErkundung', 'durchgeführteErkundung', 'Rutschgebiet', 'RutschgebietGespiegelt'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-pattern': ['match', ['get', 'user_lineType'], 'unpassierbar', 'PatternLineUnpassierbar', 'beabsichtigteErkundung', 'PatternLineBeabsichtigteErkundung', 'durchgeführteErkundung', 'PatternLineErkundung', 'Rutschgebiet', 'PatternLineRutschgebiet', 'RutschgebietGespiegelt', 'PatternLineRutschgebietGespiegelt', 'PatternLineUnpassierbar'],
            'line-opacity': 0.7,
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 19, 22],
        }
    },
    {
        'id': 'gl-draw-line-inactive-solidlines',
        'type': 'line',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['in', 'user_lineType', 'schwerBegehbar', 'durchgeführteVerschiebung', 'durchgeführterEinsatz'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': ['coalesce', ['get', 'user_color'], '#000000'],
            'line-opacity': 0.7,
            'line-width': 2,
        }
    },
    {
        'id': 'gl-draw-line-inactive-dashlines',
        'type': 'line',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['in', 'user_lineType', 'begehbar', 'beabsichtigteVerschiebung', 'beabsichtigterEinsatz'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': ['coalesce', ['get', 'user_color'], '#000000'],
            'line-dasharray': [6, 4],
            'line-width': 2,
        }
    },
    {
        'id': 'gl-draw-line-symbol',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['==', 'meta', 'feature'],
            ['has', 'user_icon'],
            ['!has', 'user_iconRotation'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'icon-image': ["get", "user_icon"],
            'icon-allow-overlap': true,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.1, 17, 1],
        }
    },
    {
        'id': 'gl-draw-line-symbol-active',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['==', 'meta', 'feature'],
            ['has', 'user_iconRotation'],
            ['has', 'user_icon'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'icon-image': ["get", "user_icon"],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.1, 17, 1],
            'icon-allow-overlap': true,
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-rotate': ['coalesce', ["get", "user_iconRotation"], 0],
        }
    },
    {
        'id': 'gl-draw-line-active',
        'type': 'line',
        'filter': ['all',
            ['==', '$type', 'LineString'],
            ['==', 'active', 'true']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': '#fbb03b',
            'line-dasharray': [0.2, 2],
            'line-width': 2
        }
    },
    {
        'id': 'gl-draw-polygon-and-line-vertex-stroke-inactive',
        'type': 'circle',
        'filter': ['all',
            ['==', 'meta', 'vertex'],
            ['==', '$type', 'Point'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'circle-radius': 5,
            'circle-color': '#fff'
        }
    },
    {
        'id': 'gl-draw-polygon-and-line-vertex-inactive',
        'type': 'circle',
        'filter': ['all',
            ['==', 'meta', 'vertex'],
            ['==', '$type', 'Point'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'circle-radius': 3,
            'circle-color': '#fbb03b'
        }
    },
    {
        'id': 'gl-draw-point-icon',
        'type': 'symbol',
        'filter': ['all',
            ['==', '$type', 'Point'],
            ['==', 'meta', 'feature'],
            ['has', 'user_icon'],
            ['!has', 'user_iconRotation'],
        ],
        'layout': {
            'icon-image': ['coalesce', ["get", "user_icon"], 'default_marker'],
            'icon-pitch-alignment': 'viewport',
            'icon-allow-overlap': true,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.1, 17, 1],
        }
    },
    {
        'id': 'gl-draw-point-icon-rotation',
        'type': 'symbol',
        'filter': ['all',
            ['==', '$type', 'Point'],
            ['==', 'meta', 'feature'],
            ['has', 'user_icon'],
            ['has', 'user_iconRotation'],
        ],
        'layout': {
            'icon-image': ['coalesce', ["get", "user_icon"], 'default_marker'],
            'icon-allow-overlap': true,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.1, 17, 1],
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-rotate': ['coalesce', ["get", "user_iconRotation"], 0]
        }
    },
    {
        'id': 'gl-draw-text-name-point',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'meta', 'feature'],
            ['has', 'user_name'],
            ['==', '$type', 'Point'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'text-field': ["coalesce", ["get", "user_name"], ""],
            'text-font': ["Frutiger Neue Condensed Bold"],
            'text-anchor': 'center',
            'text-offset': [0, 1.75],
            'text-size': ['interpolate', ['linear'], ['zoom'], 9, 0, 18, 16]
        },
        'paint': {
            'text-color': ['coalesce', ['get', 'user_color'], '#000000'],
        }
    },
    {
        'id': 'gl-draw-text-name',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'meta', 'feature'],
            ['has', 'user_name'],
            ['!=', '$type', 'Point'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'text-field': ["coalesce", ["get", "user_name"], ""],
            'text-font': ["Frutiger Neue Condensed Bold"],
            'text-size': ['interpolate', ['exponential', 2], ['zoom'], 9, 4, 18, 24],
            'symbol-placement': 'line',
            'text-ignore-placement': true,
            'text-anchor': 'center'
        },
        'paint': {
            'text-color': ['coalesce', ['get', 'user_color'], '#000000'],
            'text-halo-color': '#fff'
        }
    },
    {
        'id': 'gl-draw-point-inactive',
        'type': 'circle',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Point'],
            ['==', 'meta', 'feature'],
            ['!has', 'user_icon'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'circle-radius': 5,
            'circle-color': '#0055ff'
        },
    },
    {
        'id': 'gl-draw-point-stroke-active',
        'type': 'circle',
        'filter': ['all',
            ['==', '$type', 'Point'],
            ['==', 'active', 'true'],
            ['!has', 'user_icon'],
            ['!=', 'meta', 'midpoint']
        ],
        'paint': {
            'circle-radius': 7,
            'circle-color': '#fff'
        }
    },
    {
        'id': 'gl-draw-point-active',
        'type': 'circle',
        'filter': ['all',
            ['==', '$type', 'Point'],
            ['!=', 'meta', 'midpoint'],
            ['!has', 'user_icon'],
            ['==', 'active', 'true']],
        'paint': {
            'circle-radius': 5,
            'circle-color': '#fbb03b'
        }
    }
];

export default style;