import type { DesktopApi } from "@code-app/shared";

declare global {
  interface Window {
    desktopAPI: DesktopApi;
  }
}

export {};
