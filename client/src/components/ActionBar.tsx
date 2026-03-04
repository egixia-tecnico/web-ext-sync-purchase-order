/**
 * ActionBar - Barra de acciones contextual por step
 * Step 2 (Verificar): Botón "Verificar pendientes" → al completar avanza a Step 3
 * Step 3 (Resultados): "Exportar" + "Sincronizar X de Y" → si hay OC ya sincronizadas, pide confirmación
 * Step 4 (Sincronizar): Progreso automático de sincronización REAL → al completar pasa a Step 5
 * Step 5 (Finalizado): Grid actualizado con "Exportar resultados", sin opción de re-sincronizar
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOCSync } from "@/contexts/OCSyncContext";
import { useOCVerification } from "@/hooks/useOCVerification";
import { downloadCSV } from "@/lib/file-parser";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useThemeColor } from "@/contexts/ThemeColorContext";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Download, ArrowLeft, RefreshCw,
  Loader2, AlertTriangle,
} from "lucide-react";

export default function ActionBar() {
  const {
    records, isProcessing, progress, connectionStatus,
    selectedRecords, selectAll, deselectAll, selectNonSynced, selectMultipleStatuses,
    currentStep, setCurrentStep, goToNextStep, goToPrevStep,
  } = useOCSync();
  const { verifyBatch, synchronizeBatch } = useOCVerification();
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;
  const hasAutoSelectedForStep3 = useRef(false);
  const syncTriggered = useRef(false);

  // State for re-sync confirmation dialog
  const [showResyncConfirm, setShowResyncConfirm] = useState(false);
  const [resyncSyncedCount, setResyncSyncedCount] = useState(0);

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

  // When entering step 4 (Sincronizar), auto-execute sync immediately
  useEffect(() => {
    if (currentStep === 4 && !syncTriggered.current && !isProcessing) {
      syncTriggered.current = true;
      handleAutoSync();
    }
    if (currentStep !== 4) {
      syncTriggered.current = false;
    }
  }, [currentStep]);

  if (records.length === 0) return null;
  if (currentStep < 2) return null;

  const pendingCount = records.filter(r => r.status === "pending" || !r.status).length;
  const selectedCount = selectedRecords.size;
  const totalCount = records.length;
  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const handleVerify = async () => {
    if (connectionStatus !== "connected") {
      toast.error("No hay conexión con la API. Configure las credenciales primero.", { position: "bottom-left" });
      return;
    }

    const toVerify = records.filter(r => selectedRecords.has(r.id));
    await verifyBatch(toVerify);

    // After verification, advance to step 3 (Resultados)
    setCurrentStep(3);
  };

  // Triggered when user clicks "Sincronizar X de Y" in step 3
  const handleGoToSync = () => {
    if (connectionStatus !== "connected") {
      toast.error("No hay conexión con la API. Configure las credenciales primero.", { position: "bottom-left" });
      return;
    }

    if (selectedCount === 0) {
      toast.warning("No hay registros seleccionados para sincronizar", { position: "bottom-left" });
      return;
    }

    // Check if any selected records are already synced
    const selectedList = records.filter(r => selectedRecords.has(r.id));
    const alreadySyncedCount = selectedList.filter(r => r.status === "synced").length;

    if (alreadySyncedCount > 0) {
      // Show confirmation dialog before proceeding
      setResyncSyncedCount(alreadySyncedCount);
      setShowResyncConfirm(true);
      return;
    }

    // No already-synced records → proceed directly
    setCurrentStep(4);
  };

  // Called when user confirms re-sync of already-synced records
  const handleConfirmResync = () => {
    setShowResyncConfirm(false);
    setCurrentStep(4);
  };

  // Auto-executed when step 4 is entered
  const handleAutoSync = async () => {
    if (connectionStatus !== "connected") {
      toast.error("No hay conexión con la API. Configure las credenciales primero.", { position: "bottom-left" });
      setCurrentStep(3);
      return;
    }

    const toSync = records.filter(r => selectedRecords.has(r.id));
    if (toSync.length === 0) {
      toast.warning("No hay registros seleccionados para sincronizar", { position: "bottom-left" });
      setCurrentStep(3);
      return;
    }

    // Execute real synchronization (includes already-synced if user confirmed)
    await synchronizeBatch(toSync);

    // After sync, advance to step 5 (Finalizado) with updated grid
    setCurrentStep(5);
  };

  const handleExport = () => {
    const toExport = records;
    const now = new Date();
    const dateStr = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}_${String(now.getDate()).padStart(2, "0")}`;
    downloadCSV(toExport, `verificacion_oc_${dateStr}.csv`);
    toast.success(`${toExport.length} registros exportados`, { position: "bottom-left" });
  };

  return (
    <>
      {/* Re-sync confirmation dialog */}
      <AlertDialog open={showResyncConfirm} onOpenChange={setShowResyncConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirmar re-sincronización
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              ¿Está seguro que desea sincronizar nuevamente las{" "}
              <strong>{resyncSyncedCount}</strong>{" "}
              {resyncSyncedCount === 1
                ? "orden de compra que ya se encuentra"
                : "órdenes de compra que ya se encuentran"}{" "}
              en estado <strong>sincronizado</strong>?
              <br /><br />
              Ya que esto pasará{" "}
              {resyncSyncedCount === 1 ? "la orden" : "las órdenes"} a estado{" "}
              <strong>Actualizado</strong> y requerirá de la aprobación del proveedor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmResync}
              className="text-white"
              style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
            >
              Sí, sincronizar de nuevo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                  {currentStep === 4 ? "Sincronizando" : "Procesando"} {progress.current} de {progress.total}...
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

        {/* Step 3: Resultados - Exportar + Sincronizar X de Y */}
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
              {selectedCount} de {totalCount} seleccionados
            </span>

            <Button
              onClick={handleGoToSync}
              disabled={selectedCount === 0 || isProcessing}
              className="gap-1.5 text-white"
              style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
            >
              <RefreshCw className="w-4 h-4" />
              Sincronizar {selectedCount} de {totalCount}
            </Button>
          </div>
        )}

        {/* Step 4: Sincronizar - ejecución automática, solo muestra progreso */}
        {currentStep === 4 && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium flex items-center gap-2" style={{ color: `rgb(${r}, ${g}, ${b})` }}>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Sincronizando registros...
            </span>
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground">
              Procesando {selectedCount} registros seleccionados
            </span>
          </div>
        )}

        {/* Step 5: Finalizado - grid actualizado con resultados finales, sin opción de re-sincronizar */}
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
    </>
  );
}
