import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "media", // follows system preference
  theme: { extend: {} },
  plugins: [],
};
export default config;
