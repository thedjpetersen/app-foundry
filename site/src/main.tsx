import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DocsApp } from "./DocsApp";

const root = document.getElementById("root");

if (!root) {
  throw new Error("App Foundry docs root was not found.");
}

createRoot(root).render(
  <StrictMode>
    <DocsApp />
  </StrictMode>,
);
