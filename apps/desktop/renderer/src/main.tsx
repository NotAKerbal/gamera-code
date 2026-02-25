import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const splash = document.getElementById("boot-splash");
if (splash) {
  window.requestAnimationFrame(() => {
    splash.classList.add("is-hidden");
    window.setTimeout(() => {
      splash.remove();
    }, 320);
  });
}
