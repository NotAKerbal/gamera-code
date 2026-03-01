import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--theme-bg) / <alpha-value>)",
        surface: "rgb(var(--theme-surface) / <alpha-value>)",
        panel: "rgb(var(--theme-panel) / <alpha-value>)",
        accent: "rgb(var(--theme-accent) / <alpha-value>)",
        muted: "rgb(var(--theme-muted) / <alpha-value>)",
        border: "rgb(var(--theme-border) / <alpha-value>)"
      },
      fontFamily: {
        sans: ["'Space Grotesk'", "'Avenir Next'", "Segoe UI", "sans-serif"],
        mono: ["'IBM Plex Mono'", "'SFMono-Regular'", "monospace"]
      },
      boxShadow: {
        neon: "0 0 0 1px rgba(255,255,255,0.08), 0 12px 40px rgba(0,0,0,0.35)"
      }
    }
  },
  plugins: []
};

export default config;
