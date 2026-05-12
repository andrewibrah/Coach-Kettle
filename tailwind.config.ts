import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#060606",
          card: "#0e0e0e",
          surface: "#141414",
          accent: "#ffffff",
          "accent-hover": "#cccccc",
          text: "#f0f0f0",
          muted: "#9a9a9a",
          subtle: "#333333",
          border: "rgba(255, 255, 255, 0.06)",
        },
      },
      fontFamily: {
        sans: ['"Outfit"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
