/**
 * AppHeader - Header de la Mini App con branding Egixia
 * Design: "Operational Clarity" - barra superior con color primario configurable
 * Incluye indicador de estado de conexión y menú desplegable
 * 
 * Control de acceso: El menú de engranaje solo es accesible con sesión @egixia.com activa.
 * Si no hay sesión, al hacer clic en cualquier opción redirige al login por correo.
 */
import { useThemeColor } from "@/contexts/ThemeColorContext";
import { useOCSync } from "@/contexts/OCSyncContext";
import { Settings2, RefreshCw, Wifi, WifiOff, Loader2, History, ChevronDown, Users, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppHeaderProps {
  onHistoryClick: () => void;
  onLogsClick?: () => void;
}

export default function AppHeader({ onHistoryClick, onLogsClick }: AppHeaderProps) {
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;
  const { connectionStatus } = useOCSync();
  const [, navigate] = useLocation();

  // Verificar sesión admin activa
  const { data: adminSession } = trpc.auth.checkAdminSession.useQuery(undefined, {
    retry: false,
    staleTime: 30_000, // revalidar cada 30 segundos
  });

  const isAdmin = adminSession?.isAdmin === true;

  /**
   * Navegar a una ruta protegida.
   * Si hay sesión admin activa: navega directamente.
   * Si NO hay sesión: redirige al login con returnPath para volver después de autenticarse.
   */
  const handleProtectedNav = (targetPath: string, returnPath: string) => {
    if (isAdmin) {
      navigate(targetPath);
    } else {
      navigate(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
    }
  };

  /**
   * Ejecutar acción protegida (para modales como historial y logs).
   * Si hay sesión admin activa: ejecuta la acción directamente.
   * Si NO hay sesión: redirige al login con returnPath especial.
   */
  const handleProtectedAction = (action: () => void, returnPath: string) => {
    if (isAdmin) {
      action();
    } else {
      navigate(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
    }
  };

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
          
          {/* Dropdown menu - requiere sesión @egixia.com */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-2 rounded-lg hover:bg-white/15 transition-colors text-white/80 hover:text-white flex items-center gap-1"
                title={isAdmin ? "Menú de administración" : "Acceso restringido - requiere cuenta @egixia.com"}
              >
                <Settings2 className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
                {/* Indicador visual de sesión activa */}
                {isAdmin && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-400" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* Indicador de estado de autenticación */}
              {isAdmin ? (
                <div className="px-2 py-1.5 text-[10px] text-muted-foreground flex items-center gap-1.5 border-b mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  Sesión activa: {adminSession?.email}
                </div>
              ) : (
                <div className="px-2 py-1.5 text-[10px] text-amber-600 flex items-center gap-1.5 border-b mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                  Requiere cuenta @egixia.com
                </div>
              )}

              <DropdownMenuItem
                onClick={() => handleProtectedNav("/clients", "/clients")}
                className="cursor-pointer"
              >
                <Users className="w-4 h-4 mr-2" />
                Gestión de Clientes
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => handleProtectedAction(onHistoryClick, "/?openHistory=true")}
                className="cursor-pointer"
              >
                <History className="w-4 h-4 mr-2" />
                Historial de Verificaciones
              </DropdownMenuItem>

              {onLogsClick && (
                <DropdownMenuItem
                  onClick={() => handleProtectedAction(onLogsClick, "/?openLogs=true")}
                  className="cursor-pointer"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Log de Integraciones
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.header>
  );
}
