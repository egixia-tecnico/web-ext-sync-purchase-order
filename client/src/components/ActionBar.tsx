/**
 * ActionBar - Barra de acciones contextual por step
 * 
 * Step 2 (Proveedores): Manejado por SupplierCheckPanel - ActionBar no se muestra
 * Step 3 (Verificar OCs): Botón "Verificar pendientes" → solo OCs con supplierExists !== false
 * Step 4 (Resultados): "Exportar" + "Sincronizar X de Y"
 * Step 5 (Sincronizar): Progreso automático → al completar pasa a Step 6
 * Step 6 (Finalizado): "Exportar resultados", sin opción de re-sincronizar
 * 
 * CANCELACIÓN: Botón "Cancelar" visible durante verificación (step 3) y sincronización (step 5)
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
  Loader2, AlertTriangle, XCircle,
} from "lucide-react";

export default function ActionBar() {
  const {
    records, isProcessing, progress, connectionStatus,
    selectedRecords, selectAll, deselectAll, selectNonSynced, selectMultipleStatuses,
    currentStep, setCurrentStep, goToNextStep, goToPrevStep,
  } = useOCSync();
  const { verifyBatch, synchronizeBatch, cancelProcess, isCancelling } = useOCVerification();
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;
  const hasAutoSelectedForStep4 = useRef(false);
  const syncTriggered = useRef(false);

  // State for re-sync confirmation dialog
  const [showResyncConfirm, setShowResyncConfirm] = useState(false);
  const [resyncSyncedCount, setResyncSyncedCount] = useState(0);

  // When entering step 4 (Resultados), auto-select non-synced records
  useEffect(() => {
    if (currentStep === 4 && !hasAutoSelectedForStep4.current) {
      selectNonSynced();
      hasAutoSelectedForStep4.current = true;
    }
    if (currentStep !== 4) {
      hasAutoSelectedForStep4.current = false;
    }
  }, [currentStep, selectNonSynced]);

  // When entering step 5 (Sincronizar), auto-execute sync immediately
  useEffect(() => {
    if (currentStep === 5 && !syncTriggered.current && !isProcessing) {
      syncTriggered.current = true;
      handleAutoSync();
    }
    if (currentStep !== 5) {
      syncTriggered.current = false;
    }
  }, [currentStep]);

  // ActionBar only shows from step 3 onwards (step 2 is handled by SupplierCheckPanel)
  if (records.length === 0) return null;
  if (currentStep < 3) return null;

  const pendingCount = records.filter(r => r.status === "pending" || !r.status).length;
  const selectedCount = selectedRecords.size;
  const totalCount = records.length;
  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  // Records eligible for verification: those whose supplier was verified as existing
  // (supplierExists === true, or undefined if supplier check was not done/errored)
  const eligibleForVerification = records.filter(r => r.supplierExists !== false);
  const excludedBySupplier = records.filter(r => r.supplierExists === false).length;

  const handleVerify = async () => {
    if (connectionStatus !== "connected") {
      toast.error("No hay conexión con la API. Configure las credenciales primero.", { position: "bottom-left" });
      return;
    }

    // Only verify records with verified suppliers (supplierExists !== false)
    const toVerify = eligibleForVerification.filter(r => selectedRecords.has(r.id));

    if (toVerify.length === 0) {
      toast.warning("No hay registros elegibles para verificar. Todos los proveedores seleccionados no existen en el portal.", { position: "bottom-left" });
      return;
    }

    const result = await verifyBatch(toVerify);

    // If cancelled, stay on step 3 so user can see partial results and re-verify
    if (result?.wasCancelled) {
      return;
    }

    // After verification, advance to step 4 (Resultados)
    setCurrentStep(4);
  };

  // Triggered when user clicks "Sincronizar X de Y" in step 4
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
      setResyncSyncedCount(alreadySyncedCount);
      setShowResyncConfirm(true);
      return;
    }

    setCurrentStep(5);
  };

  const handleConfirmResync = () => {
    setShowResyncConfirm(false);
    setCurrentStep(5);
  };

  // Auto-executed when step 5 is entered
  const handleAutoSync = async () => {
    if (connectionStatus !== "connected") {
      toast.error("No hay conexión con la API. Configure las credenciales primero.", { position: "bottom-left" });
      setCurrentStep(4);
      return;
    }

    const toSync = records.filter(r => selectedRecords.has(r.id));
    if (toSync.length === 0) {
      toast.warning("No hay registros seleccionados para sincronizar", { position: "bottom-left" });
      setCurrentStep(4);
      return;
    }

    const result = await synchronizeBatch(toSync);

    if (result?.wasCancelled) {
      setCurrentStep(6);
      return;
    }

    setCurrentStep(6);
  };

  const handleCancel = () => {
    cancelProcess();
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
                  {isCancelling
                    ? "Cancelando... finalizando lote actual"
                    : `${currentStep === 5 ? "Sincronizando" : "Verificando"} ${progress.current} de ${progress.total}...`
                  }
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground">{progressPercent}%</span>
                  {!isCancelling && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancel}
                      className="gap-1.5 text-xs h-7 px-3 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 3: Verificar OCs */}
        {currentStep === 3 && (
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
              Verificar pendientes ({eligibleForVerification.filter(r => r.status === "pending" || !r.status).length})
            </Button>

            {excludedBySupplier > 0 && !isProcessing && (
              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {excludedBySupplier} OC excluidas (proveedor no existe)
              </span>
            )}

            <div className="flex-1" />
            {!isProcessing && (
              <Button
                variant="outline"
                size="sm"
                onClick={goToPrevStep}
                className="gap-1.5 text-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Volver a proveedores
              </Button>
            )}
          </div>
        )}

        {/* Step 4: Resultados - Exportar + Sincronizar X de Y */}
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
              onClick={handleExport}
              disabled={isProcessing}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
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

        {/* Step 5: Sincronizar - ejecución automática con opción de cancelar */}
        {currentStep === 5 && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium flex items-center gap-2" style={{ color: `rgb(${r}, ${g}, ${b})` }}>
              <RefreshCw className="w-4 h-4 animate-spin" />
              {isCancelling ? "Cancelando sincronización..." : "Sincronizando registros..."}
            </span>
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground">
              {isCancelling
                ? "Finalizando lote actual..."
                : `Procesando ${selectedCount} registros seleccionados`
              }
            </span>
          </div>
        )}

        {/* Step 6: Finalizado - grid actualizado con resultados finales */}
        {currentStep === 6 && (
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
