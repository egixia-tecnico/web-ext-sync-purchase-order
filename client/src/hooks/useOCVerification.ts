/**
 * Hook para verificación y sincronización por lotes de OC
 * Ahora usa tRPC para comunicarse con el backend proxy.
 * El backend maneja: token, renovación 401, validación de proveedores.
 * 
 * Procesamiento por lotes:
 * - Verificación: el backend divide las OC en lotes según batch_size del cliente
 * - Sincronización: usa endpoint synchronizeBatch que procesa en lotes con delays
 * - Progreso: muestra lote actual / total de lotes en la UI
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
      toast.warning("No hay registros seleccionados para verificar", { position: "bottom-left" });
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
          providerExternalCode1: r.provider_external_code_1 || r.provider_external_code || "",
          providerExternalCode2: r.provider_external_code_2 || "",
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
            // Map portal data including dates
            ...(apiResult.status === "found" ? {
              buyer_name: apiResult.buyerName || target.buyer_name,
              provider_name: apiResult.providerName || target.provider_name,
              document_date: apiResult.documentDate || undefined,
              synchronization_date: apiResult.synchronizationDate || undefined,
              delivery_status: apiResult.deliveryStatus || undefined,
              canceled: apiResult.canceled || undefined,
              updated: apiResult.updated || undefined,
              portalData: {
                buyerName: apiResult.buyerName || "",
                providerCode: apiResult.providerExternalCode1 || "",
                providerName: apiResult.providerName || "",
                documentDate: apiResult.documentDate || "",
                deliveryStatus: apiResult.deliveryStatus || "",
                canceled: apiResult.canceled || "",
                updated: apiResult.updated || "",
                synchronizationDate: apiResult.synchronizationDate || "",
              },
            } : {}),
          },
        });
      }

      // Apply all updates
      updateRecordsBatch(batchUpdates);

      // Show summary toast with batch info
      if (result.summary) {
        const s = result.summary;
        const batchMsg = result.batchInfo
          ? ` (${result.batchInfo.totalBatches} lotes de ${result.batchInfo.batchSize})`
          : "";
        toast.success(
          `Verificación completada${batchMsg}: ${s.found} sincronizadas, ${s.not_found} no encontradas, ${s.supplier_not_exists} proveedor no existe, ${s.errors} errores`,
          { position: "bottom-left", duration: 8000 }
        );
      }

      // Show sync rules if available and there are unsynchronized orders
      if (result.clientInfo?.syncRules && (result.summary.not_found > 0 || result.summary.supplier_not_exists > 0)) {
        toast.info(
          `Reglas de sincronización: ${result.clientInfo.syncRules}`,
          { position: "bottom-left", duration: 10000 }
        );
      }

      setProgress({ current: targets.length, total: targets.length });
    } catch (err: any) {
      const errorMsg = err?.message || "Error desconocido";
      
      // Handle communication failure alerts (blocking popup)
      if (errorMsg.includes("COMMUNICATION_FAILURE_TOKEN")) {
        (window as any).__showCommFailure?.("token");
        return;
      } else if (errorMsg.includes("COMMUNICATION_FAILURE_SERVICE")) {
        (window as any).__showCommFailure?.("service");
        return;
      } else if (errorMsg.includes("NO_CONNECTION_503")) {
        toast.error("No hay conexión con el servidor", { position: "bottom-left", duration: 6000 });
      } else {
        toast.error(`Error en verificación: ${errorMsg}`, { position: "bottom-left", duration: 6000 });
      }

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

  // Use the new batch synchronization endpoint
  const synchronizeBatchMutation = trpc.egixia.synchronizeBatch.useMutation();

  const synchronizeBatch = useCallback(async (recordsToSync?: OCRecord[]) => {
    // Use selected records if no specific records provided
    const targets = recordsToSync || records.filter(r => selectedRecords.has(r.id));
    
    // Send ALL selected records regardless of status (user confirmed re-sync if needed)
    const toSync = targets;
    
    if (toSync.length === 0) {
      toast.warning("No hay registros seleccionados para sincronizar", { position: "bottom-left" });
      return { success: 0, failed: 0, skipped: 0 };
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: toSync.length });

    try {
      // Call the batch synchronization endpoint (backend handles batching + delays)
      const result = await synchronizeBatchMutation.mutateAsync({
        orders: toSync.map(r => ({
          buyerExternalCode: r.buyer_external_code,
          purchaseOrderNumber: r.purchase_order_number,
          sendEmails: false,
        })),
        clientKey: clientKey || undefined,
      });

      const successCount = result.summary.success;
      const failedCount = result.summary.failed;

      // Update records with sync results
      for (let i = 0; i < toSync.length; i++) {
        const record = toSync[i];
        const syncResult = result.results[i];

        if (syncResult && !syncResult.success) {
          updateRecord(record.id, {
            statusMessage: syncResult.errorMessage || syncResult.error || "Error al sincronizar",
          });
        }
      }

      setProgress({ current: toSync.length, total: toSync.length });

      // Re-verify synchronized orders to update their status
      if (successCount > 0) {
        const successfulOrders = toSync.filter((_, i) => result.results[i]?.success);
        if (successfulOrders.length > 0) {
          await verifyBatch(successfulOrders);
        }
      }

      // Show summary toast with batch info
      const total = toSync.length;
      const batchMsg = result.batchInfo
        ? ` (${result.batchInfo.totalBatches} lotes de ${result.batchInfo.batchSize})`
        : "";
      if (successCount === total) {
        toast.success(`${successCount} de ${total} órdenes sincronizadas correctamente${batchMsg}`, { position: "bottom-left", duration: 5000 });
      } else if (successCount > 0) {
        toast.warning(`${successCount} de ${total} órdenes sincronizadas correctamente${batchMsg}`, { position: "bottom-left", duration: 5000 });
      } else {
        toast.error(`0 de ${total} órdenes sincronizadas`, { position: "bottom-left", duration: 5000 });
      }

      return { success: successCount, failed: failedCount, skipped: 0 };
    } catch (err: any) {
      const syncErrMsg = err?.message || "Error al sincronizar";
      // Handle communication failure alerts (blocking popup)
      if (syncErrMsg.includes("COMMUNICATION_FAILURE_TOKEN")) {
        (window as any).__showCommFailure?.("token");
        setIsProcessing(false);
        return { success: 0, failed: toSync.length, skipped: 0 };
      } else if (syncErrMsg.includes("COMMUNICATION_FAILURE_SERVICE")) {
        (window as any).__showCommFailure?.("service");
        setIsProcessing(false);
        return { success: 0, failed: toSync.length, skipped: 0 };
      }

      toast.error(`Error en sincronización: ${syncErrMsg}`, { position: "bottom-left", duration: 6000 });

      // Mark all as error
      const errorUpdates = toSync.map(r => ({
        id: r.id,
        updates: { statusMessage: syncErrMsg },
      }));
      updateRecordsBatch(errorUpdates);

      setIsProcessing(false);
      return { success: 0, failed: toSync.length, skipped: 0 };
    } finally {
      setIsProcessing(false);
    }
  }, [records, selectedRecords, updateRecord, updateRecordsBatch, setIsProcessing, setProgress, synchronizeBatchMutation, verifyBatch, clientKey]);

  return { verifyBatch, synchronizeBatch };
}
