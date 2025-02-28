import React, { useEffect, useState, useContext } from "react";
import { LayerContext } from "../LayerContext";

interface Layer {
    name: string;
    title: string;
    key: string;
}

const WMSLayerMenu = (props: { disable: () => void }) => {
    const [layers, setLayers] = useState<Layer[]>([]);
    const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
    const { dispatch } = useContext(LayerContext);
    const { disable } = props;
    const server = "https://geo.ur.ch/wms";

    useEffect(() => {
        fetch(`${server}?&SERVICE=WMS&VERSION=1.3.0&request=getCapabilities`)
            .then((response) => response.text())
            .then((data) => {
                const parser = new DOMParser();
                const xml = parser.parseFromString(data, "text/xml");
                const layerElements = xml.getElementsByTagName("Layer");
                const layers = Array.from(layerElements).map((layer, index) => ({
                    name: layer.getElementsByTagName("Name")[0].textContent || "",
                    title: layer.getElementsByTagName("Title")[0].textContent || "",
                    key: `${layer.getElementsByTagName("Name")[0].textContent || ""}-${index}`,
                }));
                setLayers(layers);
            })
            .catch((error) => console.error("Error fetching WMS layers:", error));
    }, [server]);

    const handleLayerSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const layerName = event.target.value;
        const layer = layers.find((l) => l.name === layerName);
        if (layer) {
            setSelectedLayer(layerName);
            dispatch({ type: "ADD_WMS_LAYER", payload: { layerName: layerName, title: layer.title, opacity: 0.7, server: server } });
            disable();
        }
    };

    return (
        <div className="panel-block is-align-items-flex-start is-justify-content-space-between">
            <select className="is-align-items-flex-start is-justify-content-space-between" onChange={handleLayerSelect} value={selectedLayer || ""}>
                <option value="" disabled>Select a layer</option>
                {layers.map((layer) => (
                    <option key={layer.key} value={layer.name}>
                        {layer.title}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default WMSLayerMenu;
