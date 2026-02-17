/**
 * AppHeader - Header de la Mini App con branding Egixia
 * Design: "Operational Clarity" - barra superior con color primario configurable
 * Incluye indicador de estado de conexión y menú desplegable
 */
import { useThemeColor } from "@/contexts/ThemeColorContext";
import { useOCSync } from "@/contexts/OCSyncContext";
import { Settings2, RefreshCw, Wifi, WifiOff, Loader2, History, ChevronDown, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppHeaderProps {
  onHistoryClick: () => void;
}

export default function AppHeader({ onHistoryClick }: AppHeaderProps) {
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;
  const { connectionStatus } = useOCSync();
  const [, navigate] = useLocation();

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
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5 mr-1">
            {connectionStatus === "connected" && (
              <span className="flex items-center gap-1 text-white/70 text-[10px]">
                <Wifi className="w-3 h-3" />
                <span className="hidden sm:inline">Conectado</span>
              </span>
            )}
            {connectionStatus === "connecting" && (
              <span className="flex items-center gap-1 text-white/70 text-[10px]">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="hidden sm:inline">Conectando...</span>
              </span>
            )}
            {connectionStatus === "error" && (
              <span className="flex items-center gap-1 text-red-200 text-[10px]">
                <WifiOff className="w-3 h-3" />
                <span className="hidden sm:inline">Desconectado</span>
              </span>
            )}
            {connectionStatus === "idle" && (
              <span className="flex items-center gap-1 text-white/50 text-[10px]">
                <WifiOff className="w-3 h-3" />
                <span className="hidden sm:inline">Sin conexión</span>
              </span>
            )}
          </div>
          <span className="hidden md:inline text-white/50 text-[11px] font-mono">
            Powered by Egixia
          </span>
          
          {/* Dropdown menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-2 rounded-lg hover:bg-white/15 transition-colors text-white/80 hover:text-white flex items-center gap-1"
                title="Menú"
              >
                <Settings2 className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => navigate("/clients")} className="cursor-pointer">
                <Users className="w-4 h-4 mr-2" />
                Gestión de Clientes
              </DropdownMenuItem>

              <DropdownMenuItem onClick={onHistoryClick} className="cursor-pointer">
                <History className="w-4 h-4 mr-2" />
                Historial de Verificaciones
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.header>
  );
}
