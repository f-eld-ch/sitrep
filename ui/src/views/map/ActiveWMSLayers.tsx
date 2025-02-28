import { useContext } from "react";
import { Source, Layer as MapLayer } from "react-map-gl/maplibre";
import { LayerContext, WMSLayer } from "./LayerContext";

const ActiveWMSLayers = () => {
    const { state } = useContext(LayerContext);
    if (!state.wmsLayers) {
        return null;
    }

    return (
        <>
            {state.wmsLayers
                .filter((layer: WMSLayer) => layer.isVisible)
                .map((layer: WMSLayer) => (
                    <Source
                        key={layer.name}
                        id={layer.name}
                        type="raster"
                        tiles={[
                            `${layer.server}?REQUEST=GetMap&SERVICE=WMS&VERSION=1.3.0&FORMAT=image%2Fpng&STYLES=&TRANSPARENT=TRUE&LAYERS=${layer.name}&CRS=EPSG%3A3857&SRS=EPSG%3A3857&WIDTH=512&HEIGHT=512&FORMAT_OPTIONS=dpi%3A180&BBOX={bbox-epsg-3857}`,
                        ]}
                        tileSize={512}
                    >
                        <MapLayer
                            id={layer.name}
                            type="raster"
                            paint={{
                                "raster-opacity": layer.opacity,
                            }}
                        />
                    </Source>
                ))}
        </>
    );
};

export default ActiveWMSLayers;
