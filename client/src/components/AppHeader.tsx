/**
 * AppHeader - Header de la Mini App con branding Egixia
 * Design: "Operational Clarity" - barra superior con color primario configurable
 */
import { useThemeColor } from "@/contexts/ThemeColorContext";
import { Settings2, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

interface AppHeaderProps {
  onSettingsClick: () => void;
}

export default function AppHeader({ onSettingsClick }: AppHeaderProps) {
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-50"
      style={{
        background: `linear-gradient(135deg, rgb(${r}, ${g}, ${b}), rgb(${Math.max(0, r - 25)}, ${Math.max(0, g - 25)}, ${Math.max(0, b - 25)}))`,
      }}
    >
      <div className="container flex items-center justify-between h-14">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-white/90" />
            <h1 className="text-base font-semibold text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              OC Sync
            </h1>
          </div>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-white/20 text-white border border-white/30 animate-pulse">
            Beta
          </span>
          <span className="hidden sm:inline text-white/60 text-xs ml-1">
            Verificación y Sincronización de Órdenes de Compra
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:inline text-white/50 text-[11px] font-mono">
            Powered by Egixia
          </span>
          <button
            onClick={onSettingsClick}
            className="p-2 rounded-lg hover:bg-white/15 transition-colors text-white/80 hover:text-white"
            title="Configuración API"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.header>
  );
}
