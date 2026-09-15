/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // A deliberate palette for an identity/security product:
        // deep ink-blue for trust/authority, a warm signal amber reserved
        // ONLY for verification states (present/verified), slate for the
        // rest. Avoids the generic cream+terracotta and SaaS-card defaults.
        ink: {
          950: "#0B1220",
          900: "#101B2D",
          800: "#16233A",
          700: "#223353",
        },
        signal: {
          500: "#E0A030",
          600: "#C6871D",
        },
        mist: {
          50: "#F6F7F9",
          100: "#EBEDF2",
          200: "#D7DBE3",
          400: "#8A93A6",
          600: "#525C70",
        },
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
