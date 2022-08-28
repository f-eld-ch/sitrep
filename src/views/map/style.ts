
export const style = [
    {
        'id': 'gl-draw-polygon-fill-inactive',
        'type': 'fill',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Polygon'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'fill-color': ['coalesce', ['get', 'user_color'], '#055ff'],
            'fill-outline-color': ['coalesce', ['get', 'user_color'], '#0055ff'],
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
            'circle-radius': 3,
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
            'line-color': ['coalesce', ['get', 'user_color'], '#0055ff'],
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
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': ['coalesce', ['get', 'user_color'], '#0055ff'],
            'line-width': 2
        }
    },
    {
        'id': 'gl-draw-line-symbol-inactive',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['==', 'meta', 'feature'],
            ['has', 'user_icon'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'icon-image': ["get", "user_icon"],
            'icon-allow-overlap': true,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 18, 1],
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
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'icon-image': ["get", "user_icon"],
            'icon-allow-overlap': true,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 18, 1],
        }
    },
    {
        'id': 'gl-draw-text-name',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'meta', 'feature'],
            ['has', 'user_name'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'text-field': ["coalesce", ["get", "user_name"]],
            'text-font': ["Frutiger Neue Condensed Bold"],
            'text-offset': [0, 1.25],
            'text-anchor': 'top'
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
            'circle-radius': 3,
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
            'circle-radius': 3,
            'circle-color': '#fbb03b'
        }
    },
    {
        'id': 'gl-draw-polygon-fill-static',
        'type': 'fill',
        'filter': ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
        'paint': {
            'fill-color': '#404040',
            'fill-outline-color': '#404040',
            'fill-opacity': 0.1
        }
    },
    {
        'id': 'gl-draw-polygon-stroke-static',
        'type': 'line',
        'filter': ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': '#404040',
            'line-width': 2
        }
    },
    {
        'id': 'gl-draw-line-static',
        'type': 'line',
        'filter': ['all', ['==', 'mode', 'static'], ['==', '$type', 'LineString']],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': '#404040',
            'line-width': 2
        }
    },
    {
        'id': 'gl-draw-point-static',
        'type': 'circle',
        'filter': ['all', ['==', 'mode', 'static'], ['==', '$type', 'Point']],
        'paint': {
            'circle-radius': 1,
            'circle-color': '#404040'
        }
    }
];

export default style;