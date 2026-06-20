/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // 'media' mode: dark: variants respond to Appearance.setColorScheme() via useColorScheme()
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#7C3AED",
          light: "#A78BFA",
          dark: "#5B21B6",
        },
        // These reference CSS variables defined in global.css.
        // The rgb(.../<alpha-value>) pattern allows opacity modifiers like bg-dark-border/50.
        dark: {
          bg:      "rgb(var(--color-dark-bg) / <alpha-value>)",
          surface: "rgb(var(--color-dark-surface) / <alpha-value>)",
          raised:  "rgb(var(--color-dark-raised) / <alpha-value>)",
          border:  "rgb(var(--color-dark-border) / <alpha-value>)",
        },
        content: {
          primary:   "rgb(var(--color-content-primary) / <alpha-value>)",
          secondary: "rgb(var(--color-content-secondary) / <alpha-value>)",
          muted:     "rgb(var(--color-content-muted) / <alpha-value>)",
        },
        urgent: "#F96E1B",
      },
    },
  },
  plugins: [],
};
