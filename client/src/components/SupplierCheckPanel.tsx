// SupplierCheckPanel - Paso 2: Verificación automática de proveedores
// Lotes de máximo 50 proveedores por llamada.
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOCSync } from "@/contexts/OCSyncContext";
import { useThemeColor } from "@/contexts/ThemeColorContext";
import { useClientKey } from "@/contexts/ClientKeyContext";
import { verifySuppliersBatch, testToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { downloadCSV } from "@/lib/file-parser";
import { toast } from "sonner";
import {
  Users, CheckCircle2, XCircle, AlertTriangle, ArrowRight,
  Loader2, RefreshCw, Building2, Download, Info, ArrowLeft,
} from "lucide-react";

const SUPPLIER_BATCH_SIZE = 50;
const PARALLEL_GROUP_SIZE = 4;
const GROUP_DELAY_MS = 2000;

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

    // Test connectivity
    try {
      const tokenResult = await testToken(clientKey || "");
      if (!tokenResult.success) {
        setIsProcessing(false);
        (window as unknown as Record<string, unknown>).__showCommFailure?.("token");
        return;
      }
    } catch {
      setIsProcessing(false);
      (window as unknown as Record<string, unknown>).__showCommFailure?.("token");
      return;
    }

    // Extract unique suppliers
    const supplierMap = new Map<string, { providerExternalCode1: string; providerExternalCode2: string }>();
    for (const rec of records) {
      const code1 = rec.provider_external_code_1 || rec.provider_external_code || "";
      const code2 = rec.provider_external_code_2 || "";
      const key = `${code1}|${code2}`;
      if (code1 && !supplierMap.has(key)) supplierMap.set(key, { providerExternalCode1: code1, providerExternalCode2: code2 });
    }
    const uniqueSuppliers = Array.from(supplierMap.values());

    const batches: typeof uniqueSuppliers[] = [];
    for (let i = 0; i < uniqueSuppliers.length; i += SUPPLIER_BATCH_SIZE)
      batches.push(uniqueSuppliers.slice(i, i + SUPPLIER_BATCH_SIZE));

    const parallelGroups: typeof batches[] = [];
    for (let i = 0; i < batches.length; i += PARALLEL_GROUP_SIZE)
      parallelGroups.push(batches.slice(i, i + PARALLEL_GROUP_SIZE));

    setProgress({ current: 0, total: uniqueSuppliers.length });

    const allResults: SupplierResult[] = [];
    let processedCount = 0;

    for (let groupIdx = 0; groupIdx < parallelGroups.length; groupIdx++) {
      if (cancelRef.current) break;

      const group = parallelGroups[groupIdx];
      const groupPromises = group.map(async (batch) => {
        try {
          const result = await verifySuppliersBatch(clientKey || "", batch);
          return result.results;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Error";
          return batch.map((s) => ({ ...s, exists: false, error: msg }));
        }
      });

      const groupResults = await Promise.all(groupPromises);
      for (const batchResults of groupResults) {
        allResults.push(...batchResults);
        processedCount += batchResults.length;
      }
      setProgress({ current: processedCount, total: uniqueSuppliers.length });

      if (groupIdx < parallelGroups.length - 1 && !cancelRef.current) {
        await new Promise<void>((resolve) => setTimeout(resolve, GROUP_DELAY_MS));
      }
    }

    const resultMap = new Map<string, SupplierResult>();
    for (const res of allResults) {
      resultMap.set(`${res.providerExternalCode1}|${res.providerExternalCode2}`, res);
    }

    const batchUpdates = records.map((rec) => {
      const code1 = rec.provider_external_code_1 || rec.provider_external_code || "";
      const code2 = rec.provider_external_code_2 || "";
      const res = resultMap.get(`${code1}|${code2}`);
      const supplierExists = res ? res.exists : undefined;
      const statusUpdate: Partial<typeof rec> = { supplierExists, supplierCheckError: res?.error };
      if (supplierExists === false && !res?.error) {
        statusUpdate.status = "supplier_not_exists";
        statusUpdate.statusMessage = "Proveedor no existe";
      }
      return { id: rec.id, updates: statusUpdate };
    });

    updateRecordsBatch(batchUpdates);

    const existsCount = allResults.filter((r) => r.exists).length;
    const notExistsCount = allResults.filter((r) => !r.exists && !r.error).length;
    const errorCount = allResults.filter((r) => !!r.error).length;

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
        toast.warning(`${notExistsCount} proveedor(es) no encontrado(s) en el portal. Las OC asociadas serán excluidas.`, {
          position: "bottom-left", duration: 5000,
        });
      } else {
        toast.success(`Todos los proveedores verificados (${existsCount}).`, { position: "bottom-left" });
      }
    }
  };

  const handleCancel = () => { cancelRef.current = true; setIsCancelling(true); };
  const handleRetry = () => {
    hasStartedRef.current = false;
    setSupplierCheckSummary({ total: 0, exists: 0, notExists: 0, errors: 0, completed: false });
    startVerification();
  };
  const handleContinue = () => setCurrentStep(3);
  const handleBackToStart = () => setCurrentStep(1);

  const handleExportProviders = () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}_${String(now.getDate()).padStart(2, "0")}`;
    const headers = ["Nro. Orden Compra", "Cod. Comprador", "Nombre Comprador", "Cod. Proveedor 1", "Cod. Proveedor 2", "Nombre Proveedor", "Resultado", "Error"];
    const rows = records.map((rec) => {
      const resultado = rec.supplierExists === true ? "Existe" : rec.supplierExists === false && rec.supplierCheckError ? "Error" : rec.supplierExists === false ? "No existe" : "Sin verificar";
      return [rec.purchase_order_number || "", rec.buyer_external_code || "", rec.buyer_name || "", rec.provider_external_code_1 || rec.provider_external_code || "", rec.provider_external_code_2 || "", rec.provider_name || "", resultado, rec.supplierCheckError || ""];
    });
    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte_verificacion_proveedores_${dateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${records.length} registros exportados`, { position: "bottom-left" });
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const { total, exists, notExists, errors, completed } = supplierCheckSummary;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="bg-card rounded-xl border shadow-sm p-6 space-y-5">
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg border text-xs text-blue-600 bg-blue-50 border-blue-200">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>El sistema consulta el portal de proveedores para validar cuáles existen antes de procesar las órdenes de compra. Las OCs de proveedores no encontrados serán excluidas automáticamente.</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)` }}>
          <Users className="w-5 h-5" style={{ color: `rgb(${r}, ${g}, ${b})` }} />
        </div>
        <div>
          <h3 className="font-semibold text-foreground text-sm">Verificación de Proveedores</h3>
          <p className="text-xs text-muted-foreground">Validando existencia de proveedores únicos en el portal antes de verificar OCs</p>
        </div>
      </div>
      <AnimatePresence mode="wait">
        {isProcessing && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: `rgb(${r}, ${g}, ${b})` }} />
                <span>{isCancelling ? "Cancelando..." : `Verificando proveedores... ${progress.current} de ${progress.total}`}</span>
              </div>
              <span className="font-mono font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            {!isCancelling && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={handleCancel} className="text-xs text-muted-foreground hover:text-destructive">Cancelar</Button>
              </div>
            )}
          </motion.div>
        )}
        {!isProcessing && completed && (
          <motion.div key="results" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1"><CheckCircle2 className="w-4 h-4 text-emerald-600" /><span className="text-xs font-medium text-emerald-700">Existen</span></div>
                <p className="text-2xl font-bold text-emerald-700">{exists}</p>
                <p className="text-[10px] text-emerald-600/70 mt-0.5">{total > 0 ? Math.round((exists / total) * 100) : 0}% del total</p>
              </div>
              <div className="rounded-lg border bg-red-50 border-red-200 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1"><XCircle className="w-4 h-4 text-red-600" /><span className="text-xs font-medium text-red-700">No existen</span></div>
                <p className="text-2xl font-bold text-red-700">{notExists}</p>
                <p className="text-[10px] text-red-600/70 mt-0.5">{total > 0 ? Math.round((notExists / total) * 100) : 0}% del total</p>
              </div>
              <div className="rounded-lg border bg-amber-50 border-amber-200 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1"><AlertTriangle className="w-4 h-4 text-amber-600" /><span className="text-xs font-medium text-amber-700">Errores</span></div>
                <p className="text-2xl font-bold text-amber-700">{errors}</p>
                <p className="text-[10px] text-amber-600/70 mt-0.5">{total > 0 ? Math.round((errors / total) * 100) : 0}% del total</p>
              </div>
            </div>
            <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, 0.06)`, borderLeft: `3px solid rgb(${r}, ${g}, ${b})` }}>
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: `rgb(${r}, ${g}, ${b})` }} />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{total} proveedor(es) único(s) verificado(s)</p>
                  {notExists > 0 && <p className="text-muted-foreground">Las <strong>{records.filter((r) => r.supplierExists === false).length} OC</strong> asociadas a proveedores no encontrados serán excluidas automáticamente.</p>}
                  {notExists === 0 && errors === 0 && <p className="text-muted-foreground">Todos los proveedores existen en el portal. Puede continuar con la verificación de OCs.</p>}
                  {errors > 0 && <p className="text-muted-foreground">{errors} proveedor(es) con error. Se incluirán en la verificación de OCs.</p>}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleBackToStart} className="text-xs gap-1.5"><ArrowLeft className="w-3.5 h-3.5" />Volver al inicio</Button>
                <Button variant="ghost" size="sm" onClick={handleRetry} className="text-xs gap-1.5"><RefreshCw className="w-3.5 h-3.5" />Reverificar</Button>
                <Button variant="outline" size="sm" onClick={handleExportProviders} className="text-xs gap-1.5"><Download className="w-3.5 h-3.5" />Descargar reporte</Button>
              </div>
              <Button size="sm" onClick={handleContinue} className="gap-1.5 text-xs text-white" style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}>
                Continuar a Verificar OCs<ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
        {!isProcessing && !completed && supplierCheckSummary.total === 0 && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-4 space-y-3">
            <p className="text-sm text-muted-foreground">La verificación fue cancelada. Puede reiniciarla cuando esté listo.</p>
            <Button size="sm" onClick={handleRetry} className="gap-1.5 text-xs text-white" style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}>
              <RefreshCw className="w-3.5 h-3.5" />Iniciar verificación
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
