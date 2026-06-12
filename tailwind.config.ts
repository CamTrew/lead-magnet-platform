import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        brand: {
          teal: {
            dark: "#1a4d4d",
            DEFAULT: "#2d7373",
            light: "#5fa5a5",
            50: "#f0f9f9",
            100: "#d9f0f0",
            200: "#b3e0e0",
            300: "#8dd1d1",
            400: "#67c1c1",
            500: "#41b2b2",
            600: "#2d7373",
            700: "#1a4d4d",
            800: "#163d3d",
            900: "#0f2929",
          },
          purple: {
            DEFAULT: "#7c3aed",
            light: "#a78bfa",
            50: "#f5f3ff",
            100: "#ede9fe",
            200: "#ddd6fe",
            300: "#c4b5fd",
            400: "#a78bfa",
            500: "#8b5cf6",
            600: "#7c3aed",
            700: "#6d28d9",
            800: "#5b21b6",
            900: "#4c1d95",
          },
          lime: {
            DEFAULT: "#84cc16",
            light: "#bef264",
            50: "#f7fee7",
            100: "#ecfccb",
            200: "#d9f99d",
            300: "#bef264",
            400: "#a3e635",
            500: "#84cc16",
            600: "#65a30d",
            700: "#4d7c0f",
            800: "#3f6212",
            900: "#365314",
          },
        },
      },
    },
  },
  plugins: [animate],
};
export default config;
