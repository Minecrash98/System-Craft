import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./shared/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#18202f",
        surface: "#f6f7f9",
        signal: "#0f766e",
        warning: "#b45309"
      }
    }
  },
  plugins: []
};

export default config;
