import type * as React from "react";
import type { DesktopApi } from "@code-app/shared";

declare global {
  interface Window {
    desktopAPI: DesktopApi;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        partition?: string;
        allowpopups?: boolean | "true" | "false";
      };
    }
  }
}

export {};
