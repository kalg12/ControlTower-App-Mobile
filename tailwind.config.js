/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#7C3AED",
          light: "#A78BFA",
          dark: "#5B21B6",
        },
        dark: {
          bg: "#0C0C14",
          surface: "#14141E",
          raised: "#1C1C2A",
          border: "#2A2A3C",
        },
        content: {
          primary: "#E8E8F2",
          secondary: "#8888A0",
          muted: "#4A4A5C",
        },
        // Keep orange for priority urgency accents
        urgent: "#F96E1B",
      },
    },
  },
  plugins: [],
};
