/**
 * ActionBar - Barra de acciones contextual por step
 * Step 2 (Verificar): Botón "Verificar pendientes" → al completar avanza a Step 3
 * Step 3 (Resultados): Selecciona no-sincronizados, muestra "Exportar" y "Sincronizar"
 * Step 4 (Sincronizar): Botón "Sincronizar X de Y" → ejecuta y pasa a Step 5
 * Step 5 (Exportar): Grid actualizado con "Exportar resultados", sin opción de re-sincronizar
 */
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOCSync } from "@/contexts/OCSyncContext";
import { useOCVerification } from "@/hooks/useOCVerification";
import { downloadCSV } from "@/lib/file-parser";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useThemeColor } from "@/contexts/ThemeColorContext";
import { toast } from "sonner";
import {
  Search, Download, ArrowLeft, ArrowRight,
  Loader2, RefreshCw,
} from "lucide-react";

export default function ActionBar() {
  const {
    records, isProcessing, progress, connectionStatus,
    selectedRecords, selectAll, deselectAll, selectNonSynced, selectMultipleStatuses,
    currentStep, setCurrentStep, goToNextStep, goToPrevStep,
  } = useOCSync();
  const { verifyBatch } = useOCVerification();
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;
  const hasAutoSelectedForStep3 = useRef(false);
  const hasAutoSelectedForStep4 = useRef(false);

  // When entering step 3 (Resultados), auto-select non-synced records
  useEffect(() => {
    if (currentStep === 3 && !hasAutoSelectedForStep3.current) {
      selectNonSynced();
      hasAutoSelectedForStep3.current = true;
    }
    if (currentStep !== 3) {
      hasAutoSelectedForStep3.current = false;
    }
  }, [currentStep, selectNonSynced]);

  // When entering step 4 (Sincronizar), auto-select error and not_found records
  useEffect(() => {
    if (currentStep === 4 && !hasAutoSelectedForStep4.current) {
      selectMultipleStatuses(["error", "not_found", "supplier_not_exists", "synced_with_error"]);
      hasAutoSelectedForStep4.current = true;
    }
    if (currentStep !== 4) {
      hasAutoSelectedForStep4.current = false;
    }
  }, [currentStep, selectMultipleStatuses]);

  if (records.length === 0) return null;
  if (currentStep < 2) return null;

  const pendingCount = records.filter(r => r.status === "pending" || !r.status).length;
  const selectedCount = selectedRecords.size;
  const totalCount = records.length;
  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const handleVerify = async () => {
    if (connectionStatus !== "connected") {
      toast.error("No hay conexión con la API. Configure las credenciales primero.", { position: "top-center" });
      return;
    }

    const toVerify = records.filter(r => selectedRecords.has(r.id));
    await verifyBatch(toVerify);

    // After verification, advance to step 3 (Resultados)
    setCurrentStep(3);
  };

  const handleSync = async () => {
    if (connectionStatus !== "connected") {
      toast.error("No hay conexión con la API. Configure las credenciales primero.", { position: "top-center" });
      return;
    }

    if (selectedCount === 0) {
      toast.warning("No hay registros seleccionados para sincronizar", { position: "top-center" });
      return;
    }

    const toSync = records.filter(r => selectedRecords.has(r.id));
    await verifyBatch(toSync);
    toast.success(`Sincronización completada para ${toSync.length} registros`, { position: "top-center" });

    // After sync, advance to step 5 (Exportar) with updated grid
    setCurrentStep(5);
  };

  const handleExport = () => {
    const toExport = records;
    const now = new Date();
    const dateStr = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}_${String(now.getDate()).padStart(2, "0")}`;
    downloadCSV(toExport, `verificacion_oc_${dateStr}.csv`);
    toast.success(`${toExport.length} registros exportados`, { position: "top-center" });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-card rounded-xl border shadow-sm p-4"
    >
      {/* Progress bar during processing */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: `rgb(${r}, ${g}, ${b})` }} />
                Procesando {progress.current} de {progress.total}...
              </span>
              <span className="text-xs font-mono text-muted-foreground">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step 2: Verificar */}
      {currentStep === 2 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleVerify}
            disabled={isProcessing || pendingCount === 0}
            className="gap-2 text-white"
            style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Verificar pendientes ({pendingCount})
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevStep}
            className="gap-1.5 text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a cargar
          </Button>
        </div>
      )}

      {/* Step 3: Resultados - con selección de no-sincronizados */}
      {currentStep === 3 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevStep}
            className="gap-1.5 text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Anterior
          </Button>

          <Button
            onClick={handleExport}
            disabled={isProcessing}
            variant="outline"
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Exportar todo ({totalCount})
          </Button>

          <div className="flex-1" />

          <span className="text-xs text-muted-foreground">
            {selectedCount} de {totalCount} seleccionados (no sincronizados)
          </span>

          <Button
            onClick={goToNextStep}
            disabled={selectedCount === 0}
            className="gap-1.5 text-white"
            style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
          >
            <RefreshCw className="w-4 h-4" />
            Sincronizar {selectedCount} de {totalCount}
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Step 4: Sincronizar - ejecuta la sincronización */}
      {currentStep === 4 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevStep}
            className="gap-1.5 text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Anterior
          </Button>

          <Button
            onClick={handleSync}
            disabled={isProcessing || selectedCount === 0}
            className="gap-2 text-white"
            style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Sincronizar {selectedCount} de {totalCount}
          </Button>

          <div className="flex-1" />

          <span className="text-xs text-muted-foreground">
            {selectedCount} de {totalCount} seleccionados
          </span>
        </div>
      )}

      {/* Step 5: Exportar (final) - grid actualizado, sin opción de re-sincronizar */}
      {currentStep === 5 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleExport}
            className="gap-2 text-white"
            style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
          >
            <Download className="w-4 h-4" />
            Exportar resultados ({totalCount})
          </Button>

          <div className="flex-1" />

          <span className="text-xs text-muted-foreground">
            Sincronización completada · {totalCount} registros
          </span>
        </div>
      )}
    </motion.div>
  );
}
