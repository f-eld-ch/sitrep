import { type CoordinateSystem, LV03, LV95, WEBMERCATOR, WGS84 } from "./systems";

const registerProj4 = (
  proj4: typeof import("proj4"),
  projections: CoordinateSystem[] = [WEBMERCATOR, LV95, LV03, WGS84],
): void => {
  // adding projection defining a transformation matrix to proj4 (these projection matrices can be found on the epsg.io website)
  projections
    .filter((projection) => projection.proj4transformationMatrix)
    .forEach((projection) => {
      try {
        proj4.defs(projection.epsg, projection.proj4transformationMatrix);
      } catch (err) {
        console.log("Error while setting up projection in proj4", projection.epsg, err);
        throw err;
      }
    });
};

export { registerProj4 };
