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

import HistoryDialog from "@/components/HistoryDialog";
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
import { useClientKey } from "@/contexts/ClientKeyContext";
import ClientKeyRequired from "@/pages/ClientKeyRequired";
import ClientKeyInvalid from "@/pages/ClientKeyInvalid";

export default function Home() {
  let { user, loading, error, isAuthenticated, logout } = useAuth();
  const { clientKey, clientData, loading: clientLoading } = useClientKey();

  const [showHistory, setShowHistory] = useState(false);
  const { records, connectionStatus, connectionError, setConnectionStatus, setConnectionError, currentStep } = useOCSync();
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;

  // Auto-connect removed - connection is now handled by clientKey system

  // Reconnect function removed - handled by clientKey system

  // Validar que exista clientKey
  if (!clientKey) {
    return <ClientKeyRequired />;
  }

  // Validar que el clientKey exista en la base de datos
  if (!clientLoading && clientKey && !clientData) {
    return <ClientKeyInvalid clientKey={clientKey} />;
  }

  // Validar que el cliente este activo
  if (!clientLoading && clientData && !clientData.isActive) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Usuario No Disponible</h1>
          <p className="text-muted-foreground">
            El cliente {clientData.name} no esta disponible en este momento.
            Por favor, contacte al administrador del sistema.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader onHistoryClick={() => setShowHistory(true)} />
      <HistoryDialog open={showHistory} onOpenChange={setShowHistory} />

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

        {/* Connection error banner removed - handled by clientKey system */}

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
