import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#111014",
        card: "#1B1821",
        brand: { DEFAULT: "#8167A9", light: "#A78BFA" },
        ink: { DEFAULT: "#F3F1F7", muted: "#9A95A6" },
        income: "#34D399",
        expense: "#F87171",
        line: "#2A2632",
      },
      borderRadius: { card: "1.25rem" },
    },
  },
  plugins: [],
};
export default config;
