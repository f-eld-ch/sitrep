import React from "react";
import { createRoot } from "react-dom/client";
import { ReloadPrompt } from "utils";
import App from "./App";

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

