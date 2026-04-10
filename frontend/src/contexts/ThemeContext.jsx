import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const ThemeContext = createContext(null);

const DEFAULTS = {
  accent_color: "#ccff00",
  brand_color: "#0000FF",
  nav_bg_color: "#050A30",
};

function applyVars(colors) {
  const root = document.documentElement;
  root.style.setProperty("--theme-accent", colors.accent_color || DEFAULTS.accent_color);
  root.style.setProperty("--theme-brand",  colors.brand_color  || DEFAULTS.brand_color);
  root.style.setProperty("--theme-nav-bg", colors.nav_bg_color || DEFAULTS.nav_bg_color);
}

export function ThemeProvider({ children }) {
  const [colors, setColors] = useState(DEFAULTS);

  // Enforce dark mode globally — always
  useEffect(() => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("tdl_theme", "dark");
  }, []);

  // Fetch theme colors from backend and inject CSS vars
  useEffect(() => {
    const api = process.env.REACT_APP_BACKEND_URL;
    axios.get(`${api}/api/settings/public`)
      .then(res => {
        const merged = {
          accent_color: res.data.accent_color || DEFAULTS.accent_color,
          brand_color:  res.data.brand_color  || DEFAULTS.brand_color,
          nav_bg_color: res.data.nav_bg_color || DEFAULTS.nav_bg_color,
        };
        setColors(merged);
        applyVars(merged);
      })
      .catch(() => applyVars(DEFAULTS));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "dark", isDark: true, toggleTheme: () => {}, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
