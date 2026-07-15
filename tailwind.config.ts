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
      fontFamily: {
        // System UI text stays crisp at small sizes. The bundled Geist file is
        // retained for future editorial use, but was too heavy for controls.
        sans: ['ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        brand: {
          orange: '#FE6F34',
          coral: '#FE504F',
          yellow: '#FDC957',
          aqua: '#7FD4DD',
          black: '#111111',
          soft: '#F7F5F1',
        },
        ink: {
          50: '#f7f5f1',
          100: '#efebe4',
          200: '#dfd8cf',
          300: '#c9bfb2',
          400: '#9d9488',
          500: '#746d64',
          600: '#5c554e',
          700: '#46403b',
          800: '#2d2a27',
          900: '#1f1d1b',
          950: '#111111',
        },
      },
    },
  },
  plugins: [animate],
};
export default config;
