import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        display: ["Instrument Serif", "Georgia", "serif"],
      },
      colors: {
        ink: {
          DEFAULT: "#0B0908",
          50: "#F4EFE4",
          100: "#E2D9C5",
          200: "#B5A88E",
          300: "#7E7460",
          400: "#534B3D",
          500: "#3A3429",
          600: "#26211A",
          700: "#1A1611",
          800: "#11100C",
          900: "#0B0908",
        },
        amber: {
          DEFAULT: "#E8A33D",
          soft: "#F2C078",
          deep: "#B5781E",
        },
        cyan: {
          DEFAULT: "#7BD7E4",
          soft: "#A8E5EE",
          deep: "#3A8F9C",
        },
        rose: {
          DEFAULT: "#D4654C",
          soft: "#E8957F",
          deep: "#8E3A23",
        },
        sage: {
          DEFAULT: "#8FBC6E",
          soft: "#B5D49C",
          deep: "#557A3E",
        },
      },
      borderRadius: {
        xs: "2px",
      },
      keyframes: {
        "in-up": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulse_ring: {
          "0%": { boxShadow: "0 0 0 0 rgba(232,163,61,0.6)" },
          "100%": { boxShadow: "0 0 0 8px rgba(232,163,61,0)" },
        },
      },
      animation: {
        "in-up": "in-up 180ms cubic-bezier(0.16,1,0.3,1)",
        "pulse-ring": "pulse_ring 1.4s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
