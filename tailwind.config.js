/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#ffffff",
        surface: "#f6f6f3",
        "surface-high": "#e2e3e0",
        rule: "#d3d6da",
        paper: "#121212",
        muted: "#5c5c5c",
        faint: "#8b8b86",
        correct: "#3a8b55",
        "correct-dim": "#2e7045",
        "correct-soft": "rgba(58,139,85,0.12)",
        present: "#b5841e",
        "present-dim": "#946b16",
        "present-soft": "rgba(181,132,30,0.14)",
        absent: "#787c7e",
        danger: "#c23b2e",
        "danger-soft": "rgba(194,59,46,0.10)",
      },
      fontFamily: {
        display: ["Zilla Slab", "Rockwell", "Georgia", "serif"],
        sans: ["Libre Franklin", "Helvetica Neue", "Arial", "ui-sans-serif", "system-ui"],
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
