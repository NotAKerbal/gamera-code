import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        surface: "#121212",
        panel: "#161616",
        accent: "#f5f5f5",
        muted: "#9ca3af",
        border: "#2a2a2a"
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
