import doubleClickZoom from "@mapbox/mapbox-gl-draw/src/lib/double_click_zoom";
import DrawPoint from "@mapbox/mapbox-gl-draw/src/modes/draw_point";

const {
    stopDrawingAndRemove: originalstopDrawingAndRemove,
    onTap: originalOnTap,
    onStop: originalOnStop,
    toDisplayFeatures: originalToDisplayFeatures,
    onTrash: originalOnTrash,
    onKeyUp: originalOnKeyUp,
    ...restOriginalMethods
} = DrawPoint;

const iconPointMode = {
    originalstopDrawingAndRemove,
    originalOnTap,
    originalOnStop,
    originalOnTrash,
    originalOnKeyUp,
    ...restOriginalMethods,
};

iconPointMode.onSetup = function () {
    const selectedFeatures = this.getSelected();
    this.clearSelectedFeatures();
    doubleClickZoom.disable(this);

    const state = {
        map: this.map,
        draw: this._ctx.api,
        selectedFeatures,
        selectedPointID: null,
    };

    return state;
};

export default iconPointMode;