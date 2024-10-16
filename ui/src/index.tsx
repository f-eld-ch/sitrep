import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ReloadPrompt } from "utils";
import "./i18n";
import reportWebVitals from "./reportWebVitals";
const container = document.getElementById("root");

if (!container) {
  throw new Error("No root element found");
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
    <ReloadPrompt />
  </React.StrictMode>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals(console.log);
