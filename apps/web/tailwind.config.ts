import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#151619",
        smoke: "#7f8491",
        fog: "#c8cad0",
        ash: "#e1e2e5",
        mist: "#f3f3f5",
        paper: "#ffffff",
        charcoal: "#25272d",
        graphite: "#363940",
        pewter: "#b0b3bb",
        signal: "#059669",
        electric: "#0560fd",
      },
      backgroundImage: {
        "electric-gradient": "linear-gradient(90deg, #0560fd 0%, #3a8dff 50%, #c3d9ff 100%)",
      },
      fontSize: {
        caption: ["14px", { lineHeight: "1.5" }],
        body: ["16px", { lineHeight: "1.5" }],
        subheading: ["18px", { lineHeight: "1.6" }],
        "heading-sm": ["20px", { lineHeight: "1.33" }],
        heading: ["24px", { lineHeight: "1.2" }],
        "heading-lg": ["40px", { lineHeight: "1.14", letterSpacing: "-0.4px" }],
        "heading-xl": ["48px", { lineHeight: "1.14", letterSpacing: "-0.8px" }],
        display: ["64px", { lineHeight: "1", letterSpacing: "-1.2px" }],
        "display-lg": ["80px", { lineHeight: "1", letterSpacing: "-1.6px" }],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-in": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "fade-in-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "slide-in": "slide-in 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.35s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
