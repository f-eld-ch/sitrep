
export const drawStyle = [
    {
        'id': 'gl-draw-polygon-no-fill-pattern',
        'type': 'fill',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Polygon'],
            ['has', 'user_zoneType'],
            ['in', 'user_zoneType', 'Schadengebiet', 'Einsatzraum'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'fill-outline-color': ['coalesce', ['get', 'user_color'], '#000000'],
            'fill-opacity': 0
        }
    },
    {
        'id': 'gl-draw-polygon-special-fill-pattern',
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
            'fill-opacity': 0.9
        }
    },
    {
        'id': 'gl-draw-polygon-fill-inactive',
        'type': 'fill',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Polygon'],
            ['!in', 'user_zoneType', 'Brandzone', 'Zerstoerung', 'Schadengebiet', 'Einsatzraum'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'fill-color': ['coalesce', ['get', 'user_color'], '#000000'],
            'fill-outline-color': ['coalesce', ['get', 'user_color'], '#000000'],
            'fill-opacity': 0.5
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
            ['in', 'user_lineType', 'unpassierbar', 'beabsichtigteErkundung', 'durchgeführteErkundung', 'Rutschgebiet', 'RutschgebietGespiegelt', 'rettungsAchse'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-pattern': ['match', ['get', 'user_lineType'], 'unpassierbar', 'PatternLineUnpassierbar', 'beabsichtigteErkundung', 'PatternLineBeabsichtigteErkundung', 'durchgeführteErkundung', 'PatternLineErkundung', 'Rutschgebiet', 'PatternLineRutschgebiet', 'RutschgebietGespiegelt', 'PatternLineRutschgebietGespiegelt', 'PatternLineUnpassierbar', 'rettungsAchse', 'PatternLineRettungsachse'],
            'line-opacity': 0.7,
            'line-width': ['interpolate', ['exponential', 1], ['zoom'], 12, 2, 19, 22],
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
            'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.1, 17, 1],
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
            'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.1, 17, 1],
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-rotate': ['coalesce', ["get", "user_iconRotation"], 0]
        }
    },
    {
        'id': 'gl-draw-text-special-placement-points-center',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'meta', 'feature'],
            ['==', '$type', 'Point'],
            ['==', 'active', 'false'],
            ['has', 'user_name'],
            ['has', 'user_icon'],
            ['in', 'user_icon', 'EingesperrteAbgeschnittene', 'Obdachlose'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'text-field': ["coalesce", ["get", "user_name"], ""],
            'text-font': ["Frutiger Neue Condensed Bold"],
            'text-anchor': 'center',
            'text-offset': [0, 0],
            'text-ignore-placement': true,
            'text-size': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 22]
        },
        'paint': {
            'text-color': '#ff0000',
        }
    },
    {
        'id': 'gl-draw-text-special-placement-points-right',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'meta', 'feature'],
            ['==', '$type', 'Point'],
            ['has', 'user_name'],
            ['has', 'user_icon'],
            ['in', 'user_icon', 'Tote', 'Vermisste', 'Verletzte'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'text-field': ["coalesce", ["get", "user_name"], ""],
            'text-font': ["Frutiger Neue Condensed Bold"],
            'text-anchor': 'right',
            'text-offset': [2.25, 0.25],
            'text-ignore-placement': true,
            'text-size': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 22]
        },
        'paint': {
            'text-color': '#ff0000',
        }
    },
    {
        'id': 'gl-draw-text-name-point',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'meta', 'feature'],
            ['has', 'user_name'],
            ['!in', 'user_icon', 'EingesperrteAbgeschnittene', 'Obdachlose', 'Tote', 'Vermisste', 'Verletzte'],
            ['==', '$type', 'Point'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'text-field': ["coalesce", ["get", "user_name"], ""],
            'text-font': ["Frutiger Neue Condensed Bold"],
            'text-anchor': 'center',
            'text-offset': [0, 1.75],
            'text-ignore-placement': true,
            'text-size': ['interpolate', ['linear'], ['zoom'], 11, 2, 17, 16]
        },
        'paint': {
            'text-color': ['coalesce', ['get', 'user_color'], '#000000'],
        }
    },
    {
        'id': 'gl-draw-text-name-Polygon',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'meta', 'feature'],
            ['has', 'user_name'],
            ['==', '$type', 'Polygon'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'text-field': ["coalesce", ["get", "user_name"], ""],
            'text-font': ["Frutiger Neue Condensed Bold"],
            'text-size': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 20],
            'symbol-placement': 'line',
            'text-offset': [0, 0.5],
            'text-ignore-placement': true,
            'text-anchor': 'center'
        },
        'paint': {
            'text-color': ['coalesce', ['get', 'user_color'], '#000000'],
            'text-halo-color': '#fff'
        }
    },
    {
        'id': 'gl-draw-text-name-LineString',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'meta', 'feature'],
            ['has', 'user_name'],
            ['==', '$type', 'LineString'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'text-field': ["coalesce", ["get", "user_name"], ""],
            'text-font': ["Frutiger Neue Condensed Bold"],
            'text-size': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 20],
            'symbol-placement': 'line-center',
            'text-offset': [0, 1],
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
            ['==', 'active', 'true']],
        'paint': {
            'circle-radius': 5,
            'circle-color': '#fbb03b'
        }
    }
];

export const displayStyle = [

    {
        'id': 'gl-polygon-special-fill-pattern',
        'type': 'fill',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Polygon'],
            ['has', 'zoneType'],
            ['in', 'zoneType', 'Brandzone', 'Zerstoerung'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'fill-pattern': ['match', ['get', 'zoneType'], 'Brandzone', 'PatternBrandzone', 'Zerstoerung', 'PatternZerstoert', 'PatternBrandzone'],
            'fill-antialias': 'true',
            'fill-opacity': 0.9
        }
    },
    {
        'id': 'gl-polygon-fill-inactive',
        'type': 'fill',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Polygon'],
            ['!in', 'zoneType', 'Brandzone', 'Zerstoerung', 'Schadengebiet', 'Einsatzraum'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'fill-color': ['coalesce', ['get', 'color'], '#000000'],
            'fill-outline-color': ['coalesce', ['get', 'color'], '#000000'],
            'fill-opacity': 0.5
        }
    },
    {
        'id': 'gl-polygon-fill-active',
        'type': 'fill',
        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
        'paint': {
            'fill-color': '#fbb03b',
            'fill-outline-color': '#fbb03b',
            'fill-opacity': 0.3
        }
    },
    {
        'id': 'gl-polygon-midpoint',
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
        'id': 'gl-polygon-stroke-inactive',
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
            'line-color': ['coalesce', ['get', 'color'], '#000000'],
            'line-width': 2
        }
    },
    {
        'id': 'gl-polygon-stroke-active',
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
        'id': 'gl-line-inactive',
        'type': 'line',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['!has', 'lineType'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': ['coalesce', ['get', 'color'], '#000000'],
            'line-opacity': 0.7,
            'line-width': 2,
        }
    },
    {
        'id': 'gl-line-inactive-normalLine',
        'type': 'line',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['in', 'lineType', '', 'normal'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': ['coalesce', ['get', 'color'], '#000000'],
            'line-opacity': 0.7,
            'line-width': 2,
        }
    },
    {
        'id': 'gl-line-inactive-pattern',
        'type': 'line',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['in', 'lineType', 'unpassierbar', 'beabsichtigteErkundung', 'durchgeführteErkundung', 'Rutschgebiet', 'RutschgebietGespiegelt', 'rettungsAchse'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-pattern': ['match', ['get', 'lineType'], 'unpassierbar', 'PatternLineUnpassierbar', 'beabsichtigteErkundung', 'PatternLineBeabsichtigteErkundung', 'durchgeführteErkundung', 'PatternLineErkundung', 'Rutschgebiet', 'PatternLineRutschgebiet', 'RutschgebietGespiegelt', 'PatternLineRutschgebietGespiegelt', 'PatternLineUnpassierbar', 'rettungsAchse', 'PatternLineRettungsachse'],
            'line-opacity': 0.7,
            'line-width': ['interpolate', ['exponential', 1], ['zoom'], 12, 2, 19, 22],
        }
    },
    {
        'id': 'gl-line-inactive-solidlines',
        'type': 'line',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['in', 'lineType', 'schwerBegehbar', 'durchgeführteVerschiebung', 'durchgeführterEinsatz'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': ['coalesce', ['get', 'color'], '#000000'],
            'line-opacity': 0.7,
            'line-width': 2,
        }
    },
    {
        'id': 'gl-line-inactive-dashlines',
        'type': 'line',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['in', 'lineType', 'begehbar', 'beabsichtigteVerschiebung', 'beabsichtigterEinsatz'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': ['coalesce', ['get', 'color'], '#000000'],
            'line-dasharray': [6, 4],
            'line-width': 2,
        }
    },
    {
        'id': 'gl-line-symbol',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['==', 'meta', 'feature'],
            ['has', 'icon'],
            ['!has', 'iconRotation'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'icon-image': ["get", "icon"],
            'icon-allow-overlap': true,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.1, 17, 1],
        }
    },
    {
        'id': 'gl-line-symbol-active',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['==', 'meta', 'feature'],
            ['has', 'iconRotation'],
            ['has', 'icon'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'icon-image': ["get", "icon"],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.1, 17, 1],
            'icon-allow-overlap': true,
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-rotate': ['coalesce', ["get", "iconRotation"], 0],
        }
    },
    {
        'id': 'gl-line-active',
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
        'id': 'gl-polygon-and-line-vertex-stroke-inactive',
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
        'id': 'gl-polygon-and-line-vertex-inactive',
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
        'id': 'gl-point-icon',
        'type': 'symbol',
        'filter': ['all',
            ['==', '$type', 'Point'],
            ['==', 'meta', 'feature'],
            ['has', 'icon'],
            ['!has', 'iconRotation'],
        ],
        'layout': {
            'icon-image': ['coalesce', ["get", "icon"], 'default_marker'],
            'icon-pitch-alignment': 'viewport',
            'icon-allow-overlap': true,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.1, 17, 1],
        }
    },
    {
        'id': 'gl-point-icon-rotation',
        'type': 'symbol',
        'filter': ['all',
            ['==', '$type', 'Point'],
            ['==', 'meta', 'feature'],
            ['has', 'icon'],
            ['has', 'iconRotation'],
        ],
        'layout': {
            'icon-image': ['coalesce', ["get", "icon"], 'default_marker'],
            'icon-allow-overlap': true,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.1, 17, 1],
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-rotate': ['coalesce', ["get", "iconRotation"], 0]
        }
    },
    {
        'id': 'gl-text-special-placement-points-center',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'meta', 'feature'],
            ['==', '$type', 'Point'],
            ['has', 'name'],
            ['has', 'icon'],
            ['in', 'icon', 'EingesperrteAbgeschnittene', 'Obdachlose'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'text-field': ["coalesce", ["get", "name"], ""],
            'text-font': ["Frutiger Neue Condensed Bold"],
            'text-anchor': 'center',
            'text-offset': [0, 0],
            'text-ignore-placement': true,
            'text-size': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 22]
        },
        'paint': {
            'text-color': '#ff0000',
        }
    },
    {
        'id': 'gl-text-special-placement-points-right',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'meta', 'feature'],
            ['==', '$type', 'Point'],
            ['has', 'name'],
            ['has', 'icon'],
            ['in', 'icon', 'Tote', 'Vermisste', 'Verletzte'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'text-field': ["coalesce", ["get", "name"], ""],
            'text-font': ["Frutiger Neue Condensed Bold"],
            'text-anchor': 'right',
            'text-offset': [2.25, 0.25],
            'text-ignore-placement': true,
            'text-size': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 22]
        },
        'paint': {
            'text-color': '#ff0000',
        }
    },
    {
        'id': 'gl-text-name-point',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'meta', 'feature'],
            ['has', 'name'],
            ['!in', 'icon', 'EingesperrteAbgeschnittene', 'Obdachlose', 'Tote', 'Vermisste', 'Verletzte'],
            ['==', '$type', 'Point'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'text-field': ["coalesce", ["get", "name"], ""],
            'text-font': ["Frutiger Neue Condensed Bold"],
            'text-anchor': 'center',
            'text-offset': [0, 1.75],
            'text-ignore-placement': true,
            'text-size': ['interpolate', ['linear'], ['zoom'], 11, 2, 17, 16]
        },
        'paint': {
            'text-color': ['coalesce', ['get', 'color'], '#000000'],
        }
    },
    {
        'id': 'gl-text-name-Polygon',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'meta', 'feature'],
            ['has', 'name'],
            ['==', '$type', 'Polygon'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'text-field': ["coalesce", ["get", "name"], ""],
            'text-font': ["Frutiger Neue Condensed Bold"],
            'text-size': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 20],
            'symbol-placement': 'line',
            'text-offset': [0, 0.5],
            'text-ignore-placement': true,
            'text-anchor': 'center'
        },
        'paint': {
            'text-color': ['coalesce', ['get', 'color'], '#000000'],
            'text-halo-color': '#fff'
        }
    },
    {
        'id': 'gl-text-name-LineString',
        'type': 'symbol',
        'filter': ['all',
            ['==', 'meta', 'feature'],
            ['has', 'name'],
            ['==', '$type', 'LineString'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'text-field': ["coalesce", ["get", "name"], ""],
            'text-font': ["Frutiger Neue Condensed Bold"],
            'text-size': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 20],
            'symbol-placement': 'line-center',
            'text-offset': [0, 1],
            'text-ignore-placement': true,
            'text-anchor': 'center'
        },
        'paint': {
            'text-color': ['coalesce', ['get', 'color'], '#000000'],
            'text-halo-color': '#fff'
        }
    },
    {
        'id': 'gl-point-inactive',
        'type': 'circle',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Point'],
            ['==', 'meta', 'feature'],
            ['!has', 'icon'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'circle-radius': 5,
            'circle-color': '#0055ff'
        },
    },
    {
        'id': 'gl-point-stroke-active',
        'type': 'circle',
        'filter': ['all',
            ['==', '$type', 'Point'],
            ['==', 'active', 'true'],
            ['!has', 'icon'],
            ['!=', 'meta', 'midpoint']
        ],
        'paint': {
            'circle-radius': 7,
            'circle-color': '#fff'
        }
    },
    {
        'id': 'gl-point-active',
        'type': 'circle',
        'filter': ['all',
            ['==', '$type', 'Point'],
            ['!=', 'meta', 'midpoint'],
            ['!has', 'icon'],
            ['==', 'active', 'true']],
        'paint': {
            'circle-radius': 5,
            'circle-color': '#fbb03b'
        }
    }
];


export default drawStyle;