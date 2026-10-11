/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0a08",
        surface: "#141310",
        "surface-high": "#1b1915",
        rule: "#2a271f",
        paper: "#f3efe6",
        muted: "#978c79",
        faint: "#6b6457",
        correct: "#2f9e6e",
        "correct-dim": "#24805a",
        "correct-soft": "rgba(47,158,110,0.14)",
        present: "#c9922f",
        "present-dim": "#a87725",
        "present-soft": "rgba(201,146,47,0.14)",
        absent: "#342f26",
        danger: "#c0564a",
        "danger-soft": "rgba(192,86,74,0.14)",
      },
      fontFamily: {
        display: ["Cinzel", "Georgia", "serif"],
        sans: ["Archivo", "ui-sans-serif", "system-ui"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      keyframes: {
        "achievement-in": {
          "0%": { opacity: "0", transform: "translate(-50%, -12px)" },
          "100%": { opacity: "1", transform: "translate(-50%, 0)" },
        },
        pop: {
          "0%": { transform: "scale(0.7)" },
          "55%": { transform: "scale(1.12)" },
          "100%": { transform: "scale(1)" },
        },
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // Merged tiles slide into the square that grew (offsets set inline).
        "merge-slide": {
          "0%": { opacity: "1", transform: "translate(0, 0) scale(1)" },
          "100%": { opacity: "0", transform: "translate(var(--dx), var(--dy)) scale(0.6)" },
        },
        "float-up": {
          "0%": { opacity: "0", transform: "translateY(10%)" },
          "15%": { opacity: "1" },
          "100%": { opacity: "0", transform: "translateY(-90%)" },
        },
        burst: {
          "0%": { boxShadow: "0 0 0 0 rgba(243,239,230,0.9)" },
          "100%": { boxShadow: "0 0 0 14px rgba(243,239,230,0)" },
        },
      },
      animation: {
        "achievement-in": "achievement-in 0.25s ease-out",
        pop: "pop 0.3s ease-out both",
        "rise-in": "rise-in 0.3s ease-out both",
        "merge-slide": "merge-slide 0.26s ease-in both",
        "float-up": "float-up 1.1s ease-out both",
        burst: "burst 0.6s ease-out",
      },
    },
  },
  plugins: [],
};
