/**
 * Home Page - Egixia OC Sync Mini App Beta
 * Experiencia por etapas con visibilidad condicional:
 * Step 1 (Cargar): Hero + DataUploader
 * Step 2 (Verificar): Tabla (todos seleccionados) + Botón "Verificar pendientes"
 * Step 3 (Resultados): KPIs clicables + Tabla con fechas + Exportar + Ir a sincronizar
 * Step 4 (Sincronizar): KPIs + Tabla (errores/no encontradas seleccionados primero) + "Sincronizar X de Y"
 * Step 5 (Exportar): KPIs + Tabla actualizada (sin checkboxes) + Exportar final
 */
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { motion } from "framer-motion";
import AppHeader from "@/components/AppHeader";
import ApiConfigDialog from "@/components/ApiConfigDialog";
import WorkflowStepper from "@/components/WorkflowStepper";
import DataUploader from "@/components/DataUploader";
import KPIDashboard from "@/components/KPIDashboard";
import ActionBar from "@/components/ActionBar";
import ResultsTable from "@/components/ResultsTable";
import { useOCSync } from "@/contexts/OCSyncContext";
import { useThemeColor } from "@/contexts/ThemeColorContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Zap, Database, BarChart3, ArrowRight, AlertCircle, RefreshCw } from "lucide-react";

export default function Home() {
  let { user, loading, error, isAuthenticated, logout } = useAuth();

  const [showApiConfig, setShowApiConfig] = useState(false);
  const { records, connectionStatus, connectionError, setConnectionStatus, setConnectionError, currentStep } = useOCSync();
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;

  // Auto-connect on mount
  const testConnectionMutation = trpc.egixia.testConnection.useMutation();
  const hasAutoConnected = useRef(false);

  useEffect(() => {
    if (hasAutoConnected.current) return;
    hasAutoConnected.current = true;

    const autoConnect = async () => {
      setConnectionStatus("connecting");
      try {
        const result = await testConnectionMutation.mutateAsync({});
        if (result.success) {
          setConnectionStatus("connected");
          toast.success("Conexión establecida con la API de Egixia", { position: "top-center" });
        } else {
          setConnectionStatus("error");
          setConnectionError(result.message || "No se pudo conectar");
          toast.error(result.message || "Error al conectar con la API", { position: "top-center" });
        }
      } catch (err: any) {
        setConnectionStatus("error");
        setConnectionError(err?.message || "Error de conexión");
        toast.error("Error al conectar con la API de Egixia", { position: "top-center" });
      }
    };

    const timer = setTimeout(autoConnect, 500);
    return () => clearTimeout(timer);
  }, []);

  const reconnect = async () => {
    setConnectionStatus("connecting");
    setConnectionError(null);
    try {
      const result = await testConnectionMutation.mutateAsync({});
      if (result.success) {
        setConnectionStatus("connected");
        toast.success("Conexión restablecida", { position: "top-center" });
      } else {
        setConnectionStatus("error");
        setConnectionError(result.message || "No se pudo conectar");
        toast.error(result.message || "Error al reconectar", { position: "top-center" });
      }
    } catch (err: any) {
      setConnectionStatus("error");
      setConnectionError(err?.message || "Error de conexión");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader onSettingsClick={() => setShowApiConfig(true)} />
      <ApiConfigDialog open={showApiConfig} onOpenChange={setShowApiConfig} />

      <main className="flex-1">
        {/* Hero section - only in Step 1 (no data loaded) */}
        {currentStep === 1 && records.length === 0 && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden border-b"
            style={{
              background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.04) 0%, rgba(${r}, ${g}, ${b}, 0.01) 50%, transparent 100%)`,
            }}
          >
            <div className="absolute inset-0 opacity-[0.03]" style={{
              backgroundImage: `radial-gradient(circle at 25px 25px, rgb(${r}, ${g}, ${b}) 1px, transparent 0)`,
              backgroundSize: "50px 50px",
            }} />

            <div className="container relative py-8 lg:py-10">
              <div className="grid lg:grid-cols-5 gap-8 items-center">
                <div className="lg:col-span-3">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase text-white"
                      style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}>
                      In-App Beta
                    </span>
                    <span className="text-xs text-muted-foreground">Mini App Personalizada</span>
                  </div>
                  <h2 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    Verificación y Sincronización
                    <br />
                    <span style={{ color: `rgb(${r}, ${g}, ${b})` }}>de Órdenes de Compra</span>
                  </h2>
                  <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-xl">
                    Cargue un lote de órdenes de compra desde Excel o CSV para verificar su estado de sincronización
                    con el portal de proveedores. Identifique rápidamente las OC no sincronizadas, valide la existencia
                    de proveedores y sincronice por lotes.
                  </p>
                  <div className="flex flex-wrap gap-5 mt-6">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)` }}>
                        <Zap className="w-3.5 h-3.5" style={{ color: `rgb(${r}, ${g}, ${b})` }} />
                      </div>
                      Verificación por lotes
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)` }}>
                        <Database className="w-3.5 h-3.5" style={{ color: `rgb(${r}, ${g}, ${b})` }} />
                      </div>
                      Validación de proveedores
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)` }}>
                        <BarChart3 className="w-3.5 h-3.5" style={{ color: `rgb(${r}, ${g}, ${b})` }} />
                      </div>
                      Dashboard de indicadores
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-2 hidden lg:block">
                  <div className="relative">
                    <div className="absolute -top-3 -right-3 w-full h-full rounded-2xl border border-border/50 bg-card/50" />
                    <div className="relative bg-card rounded-2xl border shadow-lg p-5">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Flujo de trabajo</span>
                          <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                        {[
                          { step: "1", label: "Cargar Excel/CSV con OCs" },
                          { step: "2", label: "Verificar estado en portal" },
                          { step: "3", label: "Revisar indicadores KPI" },
                          { step: "4", label: "Sincronizar no encontradas" },
                          { step: "5", label: "Exportar resultados" },
                        ].map((item) => (
                          <div key={item.step} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                              style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}>
                              {item.step}
                            </div>
                            <span className="text-xs text-muted-foreground">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* Connection error banner - only in step 1 */}
        {connectionStatus === "error" && connectionError && currentStep === 1 && (
          <div className="container mt-4">
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Error de conexión</p>
                <p className="text-xs text-red-600">{connectionError}</p>
              </div>
              <button
                onClick={reconnect}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90 transition-opacity shrink-0 flex items-center gap-1.5"
                style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
              >
                <RefreshCw className="w-3 h-3" />
                Reintentar
              </button>
              <button
                onClick={() => setShowApiConfig(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-300 text-red-700 hover:bg-red-100 transition-colors shrink-0"
              >
                Configurar
              </button>
            </motion.div>
          </div>
        )}

        {/* Main content */}
        <div className="container py-5 space-y-4">
          {/* Workflow stepper - always visible */}
          <WorkflowStepper />

          {/* Step 1: Data uploader */}
          {currentStep === 1 && <DataUploader />}

          {/* Step 3, 4, 5: KPI Dashboard */}
          {currentStep >= 3 && <KPIDashboard />}

          {/* Step 2, 3, 4: Action bar (controls differ by step) */}
          {currentStep >= 2 && <ActionBar />}

          {/* Step 2+: Results table (checkboxes hidden in step 5) */}
          {currentStep >= 2 && <ResultsTable />}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-3 mt-auto">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              Egixia OC Sync v1.0 Beta
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase"
              style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)`, color: `rgb(${r}, ${g}, ${b})` }}>
              In-App
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/40">
            Desarrollado por Egixia
          </span>
        </div>
      </footer>
    </div>
  );
}
