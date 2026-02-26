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
const query = new URLSearchParams(window.location.search);
const isMainWindow = query.get("bootSplash") === "1";
if (splash && isMainWindow) {
  const splashWindow = window as Window & { __codeappSplashStart?: number };
  const splashStart = splashWindow.__codeappSplashStart ?? performance.now();
  const minVisibleMs = 180;
  const fadeDurationMs = 320;
  const elapsedMs = performance.now() - splashStart;
  const delayMs = Math.max(0, minVisibleMs - elapsedMs);

  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      splash.classList.add("is-hidden");
      window.setTimeout(() => {
        splash.remove();
      }, fadeDurationMs);
    });
  }, delayMs);
} else if (splash) {
  splash.remove();
}
