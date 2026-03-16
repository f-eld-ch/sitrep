import proj4 from "proj4";
import React from "react";
import { createRoot } from "react-dom/client";
import { registerProj4 } from "utils/coordinates/register";
import App from "./App";

const container = document.getElementById("root");

if (!container) {
  throw new Error("No root element found");
}

registerProj4(proj4);

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
