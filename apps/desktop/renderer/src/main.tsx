import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const SplashReadySignal = () => {
  React.useEffect(() => {
    const splashWindow = window as Window & { __codeappUiReady?: boolean };
    splashWindow.__codeappUiReady = true;
    window.dispatchEvent(new Event("codeapp:ui-ready"));
  }, []);

  return null;
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <SplashReadySignal />
  </React.StrictMode>
);

const splash = document.getElementById("boot-splash");
const query = new URLSearchParams(window.location.search);
const isMainWindow = query.get("bootSplash") === "1";
if (splash && isMainWindow) {
  const splashWindow = window as Window & { __codeappSplashStart?: number; __codeappUiReady?: boolean };
  const splashStart = splashWindow.__codeappSplashStart ?? performance.now();
  const minVisibleMs = 180;
  const fadeDurationMs = 320;
  const readyTimeoutMs = 2500;
  let hideScheduled = false;
  let fallbackTimer = 0;

  const scheduleHide = () => {
    if (hideScheduled) {
      return;
    }
    hideScheduled = true;
    window.removeEventListener("codeapp:ui-ready", scheduleHide);
    window.clearTimeout(fallbackTimer);

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
  };

  if (splashWindow.__codeappUiReady) {
    scheduleHide();
  } else {
    window.addEventListener("codeapp:ui-ready", scheduleHide, { once: true });
    fallbackTimer = window.setTimeout(scheduleHide, readyTimeoutMs);
  }
} else if (splash) {
  splash.remove();
}
