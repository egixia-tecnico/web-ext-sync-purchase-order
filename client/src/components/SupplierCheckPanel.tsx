/**
 * SupplierCheckPanel - Paso 2 del Wizard: Verificación automática de proveedores
 * 
 * Muestra el progreso y resultado de la verificación de proveedores únicos
 * antes de permitir la verificación de órdenes de compra.
 * 
 * Lotes de máximo 50 proveedores por llamada a supplier_exists.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOCSync } from "@/contexts/OCSyncContext";
import { useThemeColor } from "@/contexts/ThemeColorContext";
import { useClientKey } from "@/contexts/ClientKeyContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Users, CheckCircle2, XCircle, AlertTriangle, ArrowRight,
  Loader2, RefreshCw, Building2,
} from "lucide-react";

const SUPPLIER_BATCH_SIZE = 50;

interface SupplierResult {
  providerExternalCode1: string;
  providerExternalCode2: string;
  exists: boolean;
  error?: string;
}

export default function SupplierCheckPanel() {
  const { records, updateRecordsBatch, setCurrentStep, supplierCheckSummary, setSupplierCheckSummary, isProcessing, setIsProcessing, progress, setProgress } = useOCSync();
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;
  const { clientKey } = useClientKey();

  const [isCancelling, setIsCancelling] = useState(false);
  const cancelRef = useRef(false);
  const hasStartedRef = useRef(false);

  const verifySuppliersMutation = trpc.egixia.verifySuppliersBatch.useMutation();

  // Auto-start verification when component mounts (if not already completed)
  useEffect(() => {
    if (!supplierCheckSummary.completed && !isProcessing && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startVerification();
    }
  }, []);

  const startVerification = async () => {
    if (records.length === 0) return;

    cancelRef.current = false;
    setIsCancelling(false);
    setIsProcessing(true);

    // Extract unique suppliers from all records
    const supplierMap = new Map<string, { providerExternalCode1: string; providerExternalCode2: string }>();
    for (const rec of records) {
      const code1 = rec.provider_external_code_1 || rec.provider_external_code || "";
      const code2 = rec.provider_external_code_2 || "";
      const key = `${code1}|${code2}`;
      if (code1 && !supplierMap.has(key)) {
        supplierMap.set(key, { providerExternalCode1: code1, providerExternalCode2: code2 });
      }
    }

    const uniqueSuppliers = Array.from(supplierMap.values());
    const totalBatches = Math.ceil(uniqueSuppliers.length / SUPPLIER_BATCH_SIZE);

    setProgress({ current: 0, total: uniqueSuppliers.length });

    const allResults: SupplierResult[] = [];
    let processedCount = 0;

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      if (cancelRef.current) break;

      const batchStart = batchIdx * SUPPLIER_BATCH_SIZE;
      const batchEnd = Math.min(batchStart + SUPPLIER_BATCH_SIZE, uniqueSuppliers.length);
      const batch = uniqueSuppliers.slice(batchStart, batchEnd);

      try {
        const result = await verifySuppliersMutation.mutateAsync({
          suppliers: batch,
          clientKey: clientKey || undefined,
        });

        allResults.push(...result.results);
        processedCount += batch.length;
        setProgress({ current: processedCount, total: uniqueSuppliers.length });
      } catch (error: any) {
        // On API error, mark all in batch as error
        for (const s of batch) {
          allResults.push({
            providerExternalCode1: s.providerExternalCode1,
            providerExternalCode2: s.providerExternalCode2,
            exists: false,
            error: error.message,
          });
        }
        processedCount += batch.length;
        setProgress({ current: processedCount, total: uniqueSuppliers.length });
      }
    }

    // Build lookup map for quick access
    const resultMap = new Map<string, SupplierResult>();
    for (const res of allResults) {
      const key = `${res.providerExternalCode1}|${res.providerExternalCode2}`;
      resultMap.set(key, res);
    }

    // Update each record with supplier check result
    const batchUpdates = records.map(rec => {
      const code1 = rec.provider_external_code_1 || rec.provider_external_code || "";
      const code2 = rec.provider_external_code_2 || "";
      const key = `${code1}|${code2}`;
      const res = resultMap.get(key);
      return {
        id: rec.id,
        updates: {
          supplierExists: res ? res.exists : undefined,
          supplierCheckError: res?.error,
        },
      };
    });

    updateRecordsBatch(batchUpdates);

    // Calculate final summary
    const existsCount = allResults.filter(r => r.exists).length;
    const notExistsCount = allResults.filter(r => !r.exists && !r.error).length;
    const errorCount = allResults.filter(r => !!r.error).length;

    const summary = {
      total: uniqueSuppliers.length,
      exists: existsCount,
      notExists: notExistsCount,
      errors: errorCount,
      completed: !cancelRef.current,
    };

    setSupplierCheckSummary(summary);
    setIsProcessing(false);

    if (!cancelRef.current) {
      if (notExistsCount > 0) {
        toast.warning(
          `${notExistsCount} proveedor${notExistsCount > 1 ? "es" : ""} no encontrado${notExistsCount > 1 ? "s" : ""} en el portal. Las OC asociadas serán excluidas de la verificación.`,
          { position: "bottom-left", duration: 5000 }
        );
      } else {
        toast.success(`Todos los proveedores verificados correctamente (${existsCount}).`, { position: "bottom-left" });
      }
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setIsCancelling(true);
  };

  const handleRetry = () => {
    hasStartedRef.current = false;
    setSupplierCheckSummary({ total: 0, exists: 0, notExists: 0, errors: 0, completed: false });
    startVerification();
  };

  const handleContinue = () => {
    setCurrentStep(3);
  };

  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const { total, exists, notExists, errors, completed } = supplierCheckSummary;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-card rounded-xl border shadow-sm p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)` }}
        >
          <Users className="w-5 h-5" style={{ color: `rgb(${r}, ${g}, ${b})` }} />
        </div>
        <div>
          <h3 className="font-semibold text-foreground text-sm">Verificación de Proveedores</h3>
          <p className="text-xs text-muted-foreground">
            Validando existencia de proveedores únicos en el portal antes de verificar OCs
          </p>
        </div>
      </div>

      {/* Processing state */}
      <AnimatePresence mode="wait">
        {isProcessing && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: `rgb(${r}, ${g}, ${b})` }} />
                <span>
                  {isCancelling
                    ? "Cancelando..."
                    : `Verificando proveedores... ${progress.current} de ${progress.total}`}
                </span>
              </div>
              <span className="font-mono font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            {!isCancelling && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Cancelar
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* Results state */}
        {!isProcessing && completed && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* KPI cards */}
            <div className="grid grid-cols-3 gap-3">
              {/* Exists */}
              <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Existen</span>
                </div>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{exists}</p>
                <p className="text-[10px] text-emerald-600/70 dark:text-emerald-500/70 mt-0.5">
                  {total > 0 ? Math.round((exists / total) * 100) : 0}% del total
                </p>
              </div>

              {/* Not exists */}
              <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span className="text-xs font-medium text-red-700 dark:text-red-400">No existen</span>
                </div>
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">{notExists}</p>
                <p className="text-[10px] text-red-600/70 dark:text-red-500/70 mt-0.5">
                  {total > 0 ? Math.round((notExists / total) * 100) : 0}% del total
                </p>
              </div>

              {/* Errors */}
              <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Errores</span>
                </div>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{errors}</p>
                <p className="text-[10px] text-amber-600/70 dark:text-amber-500/70 mt-0.5">
                  {total > 0 ? Math.round((errors / total) * 100) : 0}% del total
                </p>
              </div>
            </div>

            {/* Summary message */}
            <div
              className="rounded-lg p-3 text-xs"
              style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, 0.06)`, borderLeft: `3px solid rgb(${r}, ${g}, ${b})` }}
            >
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: `rgb(${r}, ${g}, ${b})` }} />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {total} proveedor{total !== 1 ? "es" : ""} único{total !== 1 ? "s" : ""} verificado{total !== 1 ? "s" : ""}
                  </p>
                  {notExists > 0 && (
                    <p className="text-muted-foreground">
                      Las <strong>{records.filter(r => r.supplierExists === false).length} OC</strong> asociadas a proveedores no encontrados serán excluidas automáticamente del siguiente paso.
                    </p>
                  )}
                  {notExists === 0 && errors === 0 && (
                    <p className="text-muted-foreground">
                      Todos los proveedores existen en el portal. Puede continuar con la verificación de OCs.
                    </p>
                  )}
                  {errors > 0 && (
                    <p className="text-muted-foreground">
                      {errors} proveedor{errors !== 1 ? "es" : ""} con error de consulta. Se incluirán en la verificación de OCs para determinar su estado.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRetry}
                className="text-xs gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reverificar
              </Button>
              <Button
                size="sm"
                onClick={handleContinue}
                className="gap-1.5 text-xs text-white"
                style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
              >
                Continuar a Verificar OCs
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* Cancelled state */}
        {!isProcessing && !completed && supplierCheckSummary.total === 0 && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-4 space-y-3"
          >
            <p className="text-sm text-muted-foreground">
              La verificación fue cancelada. Puede reiniciarla cuando esté listo.
            </p>
            <Button
              size="sm"
              onClick={handleRetry}
              className="gap-1.5 text-xs text-white"
              style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Iniciar verificación
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
