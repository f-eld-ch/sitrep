export const WGStoCH = (lat: number, lng: number) => {
  return [WGStoCHy(lat, lng), WGStoCHx(lat, lng)];
};

// Convert WGS lat/lng (° dec) to CH x
const WGStoCHx = (lat: number, lng: number) => {
  // Convert decimal degrees to sexagesimal seconds
  lat = DECtoSEX(lat);
  lng = DECtoSEX(lng);

  // Auxiliary values (% Bern)
  const lat_aux = (lat - 169028.66) / 10000;
  const lng_aux = (lng - 26782.5) / 10000;

  // Process X
  const x =
    200147.07 +
    308807.95 * lat_aux +
    3745.25 * Math.pow(lng_aux, 2) +
    76.63 * Math.pow(lat_aux, 2) -
    194.56 * Math.pow(lng_aux, 2) * lat_aux +
    119.79 * Math.pow(lat_aux, 3);

  return x;
};

// Convert WGS lat/lng (° dec) to CH y
const WGStoCHy = (lat: number, lng: number) => {
  // Convert decimal degrees to sexagesimal seconds
  lat = DECtoSEX(lat);
  lng = DECtoSEX(lng);

  // Auxiliary values (% Bern)
  const lat_aux = (lat - 169028.66) / 10000;
  const lng_aux = (lng - 26782.5) / 10000;

  // Process Y
  const y =
    600072.37 +
    211455.93 * lng_aux -
    10938.51 * lng_aux * lat_aux -
    0.36 * lng_aux * Math.pow(lat_aux, 2) -
    44.54 * Math.pow(lng_aux, 3);

  return y;
};

export const CHtoWGS = (y: number, x: number) => {
  return [CHtoWGSlng(y, x), CHtoWGSlat(y, x)];
};

// Convert CH y/x to WGS lat
const CHtoWGSlat = (y: number, x: number) => {
  // Converts military to civil and to unit = 1000km
  // Auxiliary values (% Bern)
  const y_aux = (y - 600000) / 1000000;
  const x_aux = (x - 200000) / 1000000;

  // Process lat
  let lat =
    16.9023892 +
    3.238272 * x_aux -
    0.270978 * Math.pow(y_aux, 2) -
    0.002528 * Math.pow(x_aux, 2) -
    0.0447 * Math.pow(y_aux, 2) * x_aux -
    0.014 * Math.pow(x_aux, 3);

  // Unit 10000" to 1 " and converts seconds to degrees (dec)
  lat = (lat * 100) / 36;

  return lat;
};

// Convert CH y/x to WGS lng
const CHtoWGSlng = (y: number, x: number) => {
  // Converts military to civil and	to unit = 1000km
  // Auxiliary values (% Bern)
  const y_aux = (y - 600000) / 1000000;
  const x_aux = (x - 200000) / 1000000;

  // Process lng
  let lng =
    2.6779094 +
    4.728982 * y_aux +
    0.791484 * y_aux * x_aux +
    0.1306 * y_aux * Math.pow(x_aux, 2) -
    0.0436 * Math.pow(y_aux, 3);

  // Unit 10000" to 1 " and converts seconds to degrees (dec)
  lng = (lng * 100) / 36;

  return lng;
};

// Convert angle in decimal degrees to sexagesimal seconds
const DECtoSEX = (angle: number) => {
  // Extract DMS
  const deg = Math.floor(angle);
  const min = Math.floor((angle - deg) * 60);
  const sec = ((angle - deg) * 60 - min) * 60;

  // Result sexagesimal seconds
  return sec + min * 60.0 + deg * 3600.0;
};
