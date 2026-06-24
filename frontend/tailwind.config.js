/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        hold: {
          green:     "#00c853",
          blue:      "#2979ff",
          purple:    "#aa00ff",
          red:       "#ff1744",
          orange:    "#ff6d00",
          lightblue: "#00b0ff",
          white:     "#ffffff",
        },
      },
    },
  },
  plugins: [],
}

