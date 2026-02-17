/**
 * Hook para verificación y sincronización por lotes de OC
 * Ahora usa tRPC para comunicarse con el backend proxy.
 * El backend maneja: token, renovación 401, validación de proveedores.
 */
import { useCallback } from "react";
import { useOCSync, type OCRecord } from "@/contexts/OCSyncContext";
import { useClientKey } from "@/contexts/ClientKeyContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function useOCVerification() {
  const { records, updateRecord, updateRecordsBatch, setIsProcessing, setProgress, selectedRecords } = useOCSync();
  const { clientKey } = useClientKey();

  const verifyBatchMutation = trpc.egixia.verifyPurchaseOrders.useMutation();

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
        orders: targets.map(r => ({
          purchaseOrderId: r.purchase_order_number,
          supplierCode: r.provider_external_code,
          buyerCode: r.buyer_external_code,
        })),
        clientKey: clientKey || undefined,
      });

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
            status: apiResult.status === "found" ? "synced"
              : apiResult.status === "not_found" ? "not_found"
              : apiResult.status === "supplier_not_exists" ? "supplier_not_exists"
              : "error",
            statusMessage: apiResult.error || (apiResult.status === "found" ? `Sincronizada (${apiResult.syncStatus})` : apiResult.status === "not_found" ? "OC no encontrada" : "Proveedor no existe"),
          },
        });
      }

      // Apply all updates
      updateRecordsBatch(batchUpdates);

      // Show summary toast
      if (result.summary) {
        const s = result.summary;
        toast.success(
          `Verificación completada: ${s.found} sincronizadas, ${s.not_found} no encontradas, ${s.supplier_not_exists} proveedor no existe, ${s.errors} errores`,
          { position: "top-center", duration: 8000 }
        );
      }

      // Show sync rules if available and there are unsynchronized orders
      if (result.clientInfo?.syncRules && (result.summary.not_found > 0 || result.summary.supplier_not_exists > 0)) {
        toast.info(
          `Reglas de sincronización: ${result.clientInfo.syncRules}`,
          { position: "top-center", duration: 10000 }
        );
      }

      setProgress({ current: targets.length, total: targets.length });
    } catch (err: any) {
      const errorMsg = err?.message || "Error desconocido";
      toast.error(`Error en verificación: ${errorMsg}`, { position: "top-center", duration: 6000 });

      // Mark all as error
      const errorUpdates = targets.map(r => ({
        id: r.id,
        updates: { status: "error" as const, statusMessage: errorMsg },
      }));
      updateRecordsBatch(errorUpdates);
    } finally {
      setIsProcessing(false);
    }
  }, [records, selectedRecords, updateRecordsBatch, setIsProcessing, setProgress, verifyBatchMutation, clientKey]);

  return { verifyBatch };
}
