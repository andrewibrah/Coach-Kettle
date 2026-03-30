import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#1a1a2e",
          card: "#16213e",
          accent: "#4A90D9",
          "accent-hover": "#3a7bc8",
          text: "#f0f0f0",
          muted: "#a0a8c0",
          border: "rgba(74, 144, 217, 0.2)",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
