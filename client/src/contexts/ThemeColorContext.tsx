import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface ThemeColorContextType {
  primaryColor: string;
  primaryRgb: { r: number; g: number; b: number };
  setPrimaryColor: (hex: string) => void;
}

const DEFAULT_PRIMARY = "#10b981"; // emerald-500

const ThemeColorContext = createContext<ThemeColorContextType>({
  primaryColor: DEFAULT_PRIMARY,
  primaryRgb: { r: 16, g: 185, b: 129 },
  setPrimaryColor: () => {},
});

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function rgbToOklch(r: number, g: number, b: number): string {
  // Simplified conversion - use CSS color-mix for browser support
  // We'll set CSS variables directly with rgb
  return `oklch(from rgb(${r}, ${g}, ${b}) l c h)`;
}

function getContrastColor(r: number, g: number, b: number): string {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function darkenColor(r: number, g: number, b: number, factor: number = 0.15): string {
  return `rgb(${Math.round(r * (1 - factor))}, ${Math.round(g * (1 - factor))}, ${Math.round(b * (1 - factor))})`;
}

function lightenColor(r: number, g: number, b: number, factor: number = 0.9): string {
  return `rgb(${Math.round(r + (255 - r) * factor)}, ${Math.round(g + (255 - g) * factor)}, ${Math.round(b + (255 - b) * factor)})`;
}

export function ThemeColorProvider({ children }: { children: ReactNode }) {
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [primaryRgb, setPrimaryRgb] = useState(hexToRgb(DEFAULT_PRIMARY));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rgbParam = params.get("rgb") || params.get("color") || params.get("primary");
    if (rgbParam) {
      const hex = rgbParam.startsWith("#") ? rgbParam : `#${rgbParam}`;
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        setPrimaryColor(hex);
        setPrimaryRgb(hexToRgb(hex));
      }
    }
  }, []);

  useEffect(() => {
    const { r, g, b } = primaryRgb;
    const root = document.documentElement;
    const fg = getContrastColor(r, g, b);
    
    root.style.setProperty("--primary", `rgb(${r}, ${g}, ${b})`);
    root.style.setProperty("--primary-foreground", fg);
    root.style.setProperty("--ring", `rgb(${r}, ${g}, ${b})`);
    root.style.setProperty("--sidebar-primary", `rgb(${r}, ${g}, ${b})`);
    root.style.setProperty("--sidebar-primary-foreground", fg);
    root.style.setProperty("--sidebar-ring", `rgb(${r}, ${g}, ${b})`);
    root.style.setProperty("--chart-1", `rgb(${r}, ${g}, ${b})`);
    
    // Custom properties for components
    root.style.setProperty("--egixia-primary", `rgb(${r}, ${g}, ${b})`);
    root.style.setProperty("--egixia-primary-dark", darkenColor(r, g, b, 0.15));
    root.style.setProperty("--egixia-primary-light", lightenColor(r, g, b, 0.9));
    root.style.setProperty("--egixia-primary-fg", fg);
  }, [primaryRgb]);

  return (
    <ThemeColorContext.Provider value={{ primaryColor, primaryRgb, setPrimaryColor: (hex) => {
      setPrimaryColor(hex);
      setPrimaryRgb(hexToRgb(hex));
    }}}>
      {children}
    </ThemeColorContext.Provider>
  );
}

export function useThemeColor() {
  return useContext(ThemeColorContext);
}
