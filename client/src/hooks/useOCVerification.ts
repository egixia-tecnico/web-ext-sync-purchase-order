/**
 * Hook para verificación y sincronización por lotes de OC
 * Ahora usa tRPC para comunicarse con el backend proxy.
 * El backend maneja: token, renovación 401, validación de proveedores.
 */
import { useCallback } from "react";
import { useOCSync, type OCRecord } from "@/contexts/OCSyncContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function useOCVerification() {
  const { records, updateRecord, updateRecordsBatch, setIsProcessing, setProgress, selectedRecords } = useOCSync();

  const verifyBatchMutation = trpc.egixia.verifyBatch.useMutation();

  const verifyBatch = useCallback(async (recordsToVerify?: OCRecord[]) => {
    // Use selected records if no specific records provided
    const targets = recordsToVerify || records.filter(r => selectedRecords.has(r.id));
    if (targets.length === 0) {
      toast.warning("No hay registros seleccionados para verificar", { position: "top-center" });
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: targets.length });

    // Mark all targets as checking
    const checkingUpdates = targets.map(r => ({ id: r.id, updates: { status: "checking" as const, statusMessage: "Verificando..." } }));
    updateRecordsBatch(checkingUpdates);

    try {
      const result = await verifyBatchMutation.mutateAsync({
        records: targets.map(r => ({
          buyerCode: r.buyer_external_code,
          supplierCode: r.provider_external_code,
          purchaseOrderNumber: r.purchase_order_number,
        })),
      });

      if (!result.success) {
        toast.error(result.error || "Error al verificar", { position: "top-center" });
        const errorUpdates = targets.map(r => ({
          id: r.id,
          updates: { status: "error" as const, statusMessage: result.error || "Error de verificación" },
        }));
        updateRecordsBatch(errorUpdates);
        setIsProcessing(false);
        return;
      }

      // Map results back to records
      const batchUpdates: Array<{ id: string; updates: Partial<OCRecord> }> = [];

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const apiResult = result.results[i];

        if (!apiResult) {
          batchUpdates.push({
            id: target.id,
            updates: { status: "error", statusMessage: "Sin resultado del servidor" },
          });
          continue;
        }

        batchUpdates.push({
          id: target.id,
          updates: {
            status: apiResult.status === "synced" ? "synced"
              : apiResult.status === "not_found" ? "not_found"
              : apiResult.status === "supplier_not_exists" ? "supplier_not_exists"
              : "error",
            statusMessage: apiResult.statusDetail,
            portalData: apiResult.portalData,
            buyer_name: apiResult.portalData?.buyerName,
            provider_name: apiResult.portalData?.providerName,
          },
        });
      }

      updateRecordsBatch(batchUpdates);

      // Show summary toast
      if (result.summary) {
        const s = result.summary;
        toast.success(
          `Verificación completada: ${s.synced} sincronizadas, ${s.notFound} no encontradas, ${s.supplierNotExists} proveedor no existe, ${s.errors} errores. Tiempo: ${(s.executionTimeMs / 1000).toFixed(1)}s`,
          { position: "top-center", duration: 8000 }
        );
      }

      setProgress({ current: targets.length, total: targets.length });
    } catch (err: any) {
      const errorMsg = err?.message || "Error desconocido";
      
      // Check for permission errors (403)
      if (errorMsg.includes("No autorizado") || errorMsg.includes("Acceso denegado")) {
        toast.error(`Error de permisos: ${errorMsg}`, { position: "top-center", duration: 10000 });
      } else {
        toast.error(`Error al verificar: ${errorMsg}`, { position: "top-center" });
      }

      const errorUpdates = targets.map(r => ({
        id: r.id,
        updates: { status: "error" as const, statusMessage: errorMsg },
      }));
      updateRecordsBatch(errorUpdates);
    }

    setIsProcessing(false);
  }, [records, selectedRecords, updateRecord, updateRecordsBatch, setIsProcessing, setProgress, verifyBatchMutation]);

  return { verifyBatch };
}
