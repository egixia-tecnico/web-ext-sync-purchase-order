/**
 * ActionBar - Barra de acciones contextual por step
 * Step 2 (Verificar): Botón "Verificar pendientes" → al completar avanza a Step 3
 * Step 3 (Resultados): Botón "Exportar todo", navegación anterior/siguiente
 * Step 4 (Sincronizar): Botón "Sincronizar seleccionados X de Y", selección por defecto de errores/no encontradas
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
    selectedRecords, selectAll, deselectAll, selectMultipleStatuses,
    currentStep, setCurrentStep, goToNextStep, goToPrevStep,
  } = useOCSync();
  const { verifyBatch } = useOCVerification();
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;
  const hasAutoSelectedForSync = useRef(false);

  // When entering step 4, auto-select error and not_found records
  useEffect(() => {
    if (currentStep === 4 && !hasAutoSelectedForSync.current) {
      selectMultipleStatuses(["error", "not_found", "supplier_not_exists", "synced_with_error"]);
      hasAutoSelectedForSync.current = true;
    }
    if (currentStep !== 4) {
      hasAutoSelectedForSync.current = false;
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

    // Verify all records (they should all be selected in step 2)
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

      {/* Step 3: Resultados */}
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

          <Button
            onClick={goToNextStep}
            className="gap-1.5 text-white"
            style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
          >
            Sincronizar
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Step 4: Sincronizar */}
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
            Sincronizar seleccionados {selectedCount} de {totalCount}
          </Button>

          <Button
            onClick={handleExport}
            disabled={isProcessing}
            variant="outline"
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Exportar todo
          </Button>

          <div className="flex-1" />

          <span className="text-xs text-muted-foreground">
            {selectedCount} de {totalCount} seleccionados
          </span>
        </div>
      )}

      {/* Step 5: Exportar (final) */}
      {currentStep === 5 && (
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
            className="gap-2 text-white"
            style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
          >
            <Download className="w-4 h-4" />
            Exportar resultados ({totalCount})
          </Button>
        </div>
      )}
    </motion.div>
  );
}
