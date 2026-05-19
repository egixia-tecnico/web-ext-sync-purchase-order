/**
 * Hook para verificación y sincronización por lotes de OC
 * 
 * ARQUITECTURA DE LOTES (Frontend-driven):
 * - El frontend obtiene la configuración de lotes del cliente (getBatchConfig)
 * - Divide las OC en lotes de N registros (batchSize del cliente)
 * - Envía cada lote como una petición tRPC separada
 * - Espera batchDelaySeconds entre cada lote
 * - Muestra progreso en tiempo real: "Procesando lote X de Y (N registros)"
 * 
 * CANCELACIÓN:
 * - El usuario puede cancelar en cualquier momento durante verificación o sincronización
 * - Al cancelar: se detiene inmediatamente sin revertir resultados ya procesados
 * - Las OC procesadas quedan disponibles para trabajar
 * - Las OC no procesadas vuelven a estado "pending" (verificación) o se ignoran (sincronización)
 * - Se muestra resumen de OC procesadas vs canceladas
 */
import { useCallback, useRef, useState } from "react";
import { useOCSync, type OCRecord } from "@/contexts/OCSyncContext";
import { useClientKey } from "@/contexts/ClientKeyContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Helper to wait N milliseconds
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function useOCVerification() {
  const { records, updateRecord, updateRecordsBatch, setIsProcessing, setProgress, selectedRecords } = useOCSync();
  const { clientKey } = useClientKey();
  const cancelRef = useRef(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const verifyBatchMutation = trpc.egixia.verifyPurchaseOrders.useMutation();
  const testTokenMutation = trpc.egixia.testToken.useMutation();
  const batchConfigQuery = trpc.egixia.getBatchConfig.useQuery(
    { clientKey: clientKey || undefined },
    { enabled: !!clientKey, staleTime: 60000 }
  );

  // Cancel the current process
  const cancelProcess = useCallback(() => {
    cancelRef.current = true;
    setIsCancelling(true);
  }, []);

  const verifyBatch = useCallback(async (recordsToVerify?: OCRecord[]) => {
    const targets = recordsToVerify || records.filter(r => selectedRecords.has(r.id));
    if (targets.length === 0) {
      toast.warning("No hay registros seleccionados para verificar", { position: "bottom-left" });
      return;
    }

    cancelRef.current = false;
    setIsCancelling(false);

    // Step 0: Verify token connectivity before starting verification
    try {
      const tokenResult = await testTokenMutation.mutateAsync({ clientKey: clientKey || undefined });
      if (!tokenResult.success) {
        (window as any).__showCommFailure?.("token");
        return;
      }
    } catch (err: any) {
      (window as any).__showCommFailure?.("token");
      return;
    }

    // Get batch config (from cache or defaults)
    const batchSize = batchConfigQuery.data?.batchSize ?? 10;
    const batchDelaySeconds = batchConfigQuery.data?.batchDelaySeconds ?? 3;
    const syncRules = batchConfigQuery.data?.syncRules ?? null;

    // Calculate batches
    const totalBatches = Math.ceil(targets.length / batchSize);

    setIsProcessing(true);
    setProgress({ current: 0, total: targets.length });

    // Mark all targets as checking
    const checkingUpdates = targets.map(r => ({
      id: r.id,
      updates: { status: "checking" as const, statusMessage: "En cola de verificación..." }
    }));
    updateRecordsBatch(checkingUpdates);

    // Show batch info toast
    if (totalBatches > 1) {
      toast.info(
        `Procesando ${targets.length} registros en ${totalBatches} lotes de ${batchSize} (espera de ${batchDelaySeconds}s entre lotes)`,
        { position: "bottom-left", duration: 5000 }
      );
    }

    // Accumulate global summary across batches
    const globalSummary = { total: 0, found: 0, not_found: 0, supplier_not_exists: 0, errors: 0 };
    let processedCount = 0;
    let wasCancelled = false;

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      if (cancelRef.current) {
        wasCancelled = true;
        // Mark remaining unprocessed records back to "pending"
        const remainingTargets = targets.slice(batchIndex * batchSize);
        const pendingUpdates = remainingTargets.map(r => ({
          id: r.id,
          updates: { status: "pending" as const, statusMessage: "Cancelado por el usuario" }
        }));
        updateRecordsBatch(pendingUpdates);
        break;
      }

      const batchStart = batchIndex * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, targets.length);
      const batchTargets = targets.slice(batchStart, batchEnd);

      // Update status for this batch's records
      const batchCheckingUpdates = batchTargets.map(r => ({
        id: r.id,
        updates: { statusMessage: `Verificando... (lote ${batchIndex + 1} de ${totalBatches})` }
      }));
      updateRecordsBatch(batchCheckingUpdates);

      try {
        const result = await verifyBatchMutation.mutateAsync({
          orders: batchTargets.map(r => ({
            purchaseOrderId: r.purchase_order_number,
            providerExternalCode1: r.provider_external_code_1 || r.provider_external_code || "",
            providerExternalCode2: r.provider_external_code_2 || "",
            buyerCode: r.buyer_external_code,
          })),
          clientKey: clientKey || undefined,
          isFirstBatch: batchIndex === 0,
          isLastBatch: batchIndex === totalBatches - 1,
          globalSummary: batchIndex === totalBatches - 1 ? globalSummary : undefined,
        });

        // Map results back to records for this batch
        const batchUpdates: Array<{ id: string; updates: Partial<OCRecord> }> = [];

        for (let i = 0; i < batchTargets.length; i++) {
          const target = batchTargets[i];
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
              statusMessage: apiResult.error || (apiResult.status === "found" ? `Sincronizada (${apiResult.syncStatus})` : apiResult.status === "not_found" ? "OC no encontrada" : apiResult.status === "supplier_not_exists" ? "Proveedor no existe" : "Error"),
              ...(apiResult.status === "found" ? {
                buyer_name: apiResult.buyerName || target.buyer_name,
                provider_name: apiResult.providerName || target.provider_name,
                document_date: apiResult.documentDate || undefined,
                synchronization_date: apiResult.synchronizationDate || undefined,
                synchronization_date2: (apiResult as any).synchronizationDate2 || undefined,
                delivery_status: apiResult.deliveryStatus || undefined,
                canceled: apiResult.canceled != null ? String(apiResult.canceled) : undefined,
                updated: apiResult.updated != null ? String(apiResult.updated) : undefined,
                portalData: {
                  buyerName: apiResult.buyerName || "",
                  providerCode: apiResult.providerExternalCode1 || "",
                  providerName: apiResult.providerName || "",
                  documentDate: apiResult.documentDate || "",
                  deliveryStatus: apiResult.deliveryStatus || "",
                  canceled: apiResult.canceled != null ? String(apiResult.canceled) : "",
                  updated: apiResult.updated != null ? String(apiResult.updated) : "",
                  synchronizationDate: apiResult.synchronizationDate || "",
                },
              } : {}),
            },
          });
        }

        updateRecordsBatch(batchUpdates);

        // Accumulate summary
        if (result.summary) {
          globalSummary.total += result.summary.total;
          globalSummary.found += result.summary.found;
          globalSummary.not_found += result.summary.not_found;
          globalSummary.supplier_not_exists += result.summary.supplier_not_exists;
          globalSummary.errors += result.summary.errors;
        }

        processedCount += batchTargets.length;
        setProgress({ current: processedCount, total: targets.length });

      } catch (err: any) {
        const errorMsg = err?.message || "Error desconocido";

        // Handle communication failure alerts
        if (errorMsg.includes("COMMUNICATION_FAILURE_TOKEN")) {
          (window as any).__showCommFailure?.("token");
          setIsProcessing(false);
          setIsCancelling(false);
          return;
        } else if (errorMsg.includes("COMMUNICATION_FAILURE_SERVICE")) {
          (window as any).__showCommFailure?.("service");
          setIsProcessing(false);
          setIsCancelling(false);
          return;
        } else if (errorMsg.includes("NO_CONNECTION_503")) {
          toast.error("No hay conexión con el servidor", { position: "bottom-left", duration: 6000 });
          setIsProcessing(false);
          setIsCancelling(false);
          return;
        }

        // Mark this batch's records as error
        const errorUpdates = batchTargets.map(r => ({
          id: r.id,
          updates: { status: "error" as const, statusMessage: `Error lote ${batchIndex + 1}: ${errorMsg}` },
        }));
        updateRecordsBatch(errorUpdates);

        globalSummary.errors += batchTargets.length;
        globalSummary.total += batchTargets.length;
        processedCount += batchTargets.length;
        setProgress({ current: processedCount, total: targets.length });

        // Show error but continue with next batch
        toast.error(
          `Error en lote ${batchIndex + 1} de ${totalBatches}: ${errorMsg}`,
          { position: "bottom-left", duration: 5000 }
        );
      }

      // Wait between batches (except after the last batch)
      if (batchIndex < totalBatches - 1 && !cancelRef.current) {
        // Show waiting toast
        toast.info(
          `Esperando ${batchDelaySeconds}s antes del lote ${batchIndex + 2} de ${totalBatches}...`,
          { position: "bottom-left", duration: batchDelaySeconds * 1000 }
        );
        await delay(batchDelaySeconds * 1000);
      }
    }

    // Final summary toast
    const s = globalSummary;
    const cancelledCount = targets.length - processedCount;

    if (wasCancelled) {
      toast.warning(
        `Verificación cancelada: ${processedCount} de ${targets.length} registros procesados (${s.found} sincronizadas, ${s.not_found} no encontradas, ${s.supplier_not_exists} proveedor no existe, ${s.errors} errores). ${cancelledCount} registros pendientes.`,
        { position: "bottom-left", duration: 10000 }
      );
    } else {
      toast.success(
        `Verificación completada (${totalBatches} lotes): ${s.found} sincronizadas, ${s.not_found} no encontradas, ${s.supplier_not_exists} proveedor no existe, ${s.errors} errores`,
        { position: "bottom-left", duration: 8000 }
      );
    }

    // Show sync rules if available and there are unsynchronized orders
    if (syncRules && (s.not_found > 0 || s.supplier_not_exists > 0)) {
      toast.info(
        `Reglas de sincronización: ${syncRules}`,
        { position: "bottom-left", duration: 10000 }
      );
    }

    setProgress({ current: processedCount, total: targets.length });
    setIsProcessing(false);
    setIsCancelling(false);

    return { wasCancelled, processedCount, cancelledCount };
  }, [records, selectedRecords, updateRecordsBatch, setIsProcessing, setProgress, verifyBatchMutation, clientKey, batchConfigQuery.data]);

  // Batch synchronization - also frontend-driven
  const synchronizeBatchMutation = trpc.egixia.synchronizeBatch.useMutation();

  const synchronizeBatch = useCallback(async (recordsToSync?: OCRecord[]) => {
    const targets = recordsToSync || records.filter(r => selectedRecords.has(r.id));
    const toSync = targets;

    if (toSync.length === 0) {
      toast.warning("No hay registros seleccionados para sincronizar", { position: "bottom-left" });
      return { success: 0, failed: 0, skipped: 0, wasCancelled: false };
    }

    cancelRef.current = false;
    setIsCancelling(false);

    // Step 0: Verify token connectivity before starting synchronization
    try {
      const tokenResult = await testTokenMutation.mutateAsync({ clientKey: clientKey || undefined });
      if (!tokenResult.success) {
        (window as any).__showCommFailure?.("token");
        return { success: 0, failed: 0, skipped: 0, wasCancelled: false };
      }
    } catch (err: any) {
      (window as any).__showCommFailure?.("token");
      return { success: 0, failed: 0, skipped: 0, wasCancelled: false };
    }

    // Get batch config
    const batchSize = batchConfigQuery.data?.batchSize ?? 10;
    const batchDelaySeconds = batchConfigQuery.data?.batchDelaySeconds ?? 3;
    const totalBatches = Math.ceil(toSync.length / batchSize);

    setIsProcessing(true);
    setProgress({ current: 0, total: toSync.length });

    if (totalBatches > 1) {
      toast.info(
        `Sincronizando ${toSync.length} registros en ${totalBatches} lotes de ${batchSize} (espera de ${batchDelaySeconds}s entre lotes)`,
        { position: "bottom-left", duration: 5000 }
      );
    }

    let totalSuccess = 0;
    let totalFailed = 0;
    let processedCount = 0;
    let wasCancelled = false;
    const allSuccessfulOrders: OCRecord[] = [];

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      if (cancelRef.current) {
        wasCancelled = true;
        break;
      }

      const batchStart = batchIndex * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, toSync.length);
      const batchTargets = toSync.slice(batchStart, batchEnd);

      try {
        const result = await synchronizeBatchMutation.mutateAsync({
          orders: batchTargets.map(r => ({
            buyerExternalCode: r.buyer_external_code,
            purchaseOrderNumber: r.purchase_order_number,
            sendEmails: false,
          })),
          clientKey: clientKey || undefined,
        });

        const batchSuccess = result.summary.success;
        const batchFailed = result.summary.failed;
        totalSuccess += batchSuccess;
        totalFailed += batchFailed;

        // Update records with sync results
        for (let i = 0; i < batchTargets.length; i++) {
          const record = batchTargets[i];
          const syncResult = result.results[i];

          if (syncResult && !syncResult.success) {
            // Build error message with HTTP status code and API message
            const httpCode = syncResult.httpStatus ? `[HTTP ${syncResult.httpStatus}] ` : '';
            const apiMsg = syncResult.errorMessage || syncResult.error || "Error al sincronizar";
            updateRecord(record.id, {
              statusMessage: `${httpCode}${apiMsg}`,
            });
          } else if (syncResult?.success) {
            allSuccessfulOrders.push(record);
          }
        }

        processedCount += batchTargets.length;
        setProgress({ current: processedCount, total: toSync.length });

      } catch (err: any) {
        const syncErrMsg = err?.message || "Error al sincronizar";
        if (syncErrMsg.includes("COMMUNICATION_FAILURE_TOKEN")) {
          (window as any).__showCommFailure?.("token");
          setIsProcessing(false);
          setIsCancelling(false);
          return { success: totalSuccess, failed: totalFailed + (toSync.length - processedCount), skipped: 0, wasCancelled: false };
        } else if (syncErrMsg.includes("COMMUNICATION_FAILURE_SERVICE")) {
          (window as any).__showCommFailure?.("service");
          setIsProcessing(false);
          setIsCancelling(false);
          return { success: totalSuccess, failed: totalFailed + (toSync.length - processedCount), skipped: 0, wasCancelled: false };
        }

        toast.error(`Error en lote sync ${batchIndex + 1}: ${syncErrMsg}`, { position: "bottom-left", duration: 5000 });

        const errorUpdates = batchTargets.map(r => ({
          id: r.id,
          updates: { statusMessage: `Error lote sync ${batchIndex + 1}: ${syncErrMsg}` },
        }));
        updateRecordsBatch(errorUpdates);

        totalFailed += batchTargets.length;
        processedCount += batchTargets.length;
        setProgress({ current: processedCount, total: toSync.length });
      }

      // Wait between batches
      if (batchIndex < totalBatches - 1 && !cancelRef.current) {
        toast.info(
          `Esperando ${batchDelaySeconds}s antes del lote sync ${batchIndex + 2} de ${totalBatches}...`,
          { position: "bottom-left", duration: batchDelaySeconds * 1000 }
        );
        await delay(batchDelaySeconds * 1000);
      }
    }

    setProgress({ current: processedCount, total: toSync.length });

    // Show summary toast
    const cancelledCount = toSync.length - processedCount;

    if (wasCancelled) {
      toast.warning(
        `Sincronización cancelada: ${processedCount} de ${toSync.length} registros procesados (${totalSuccess} exitosos, ${totalFailed} fallidos). ${cancelledCount} registros no procesados.`,
        { position: "bottom-left", duration: 10000 }
      );
    } else {
      const batchMsg = totalBatches > 1 ? ` (${totalBatches} lotes de ${batchSize})` : "";
      if (totalSuccess === toSync.length) {
        toast.success(`${totalSuccess} de ${toSync.length} órdenes sincronizadas correctamente${batchMsg}`, { position: "bottom-left", duration: 5000 });
      } else if (totalSuccess > 0) {
        toast.warning(`${totalSuccess} de ${toSync.length} órdenes sincronizadas correctamente${batchMsg}`, { position: "bottom-left", duration: 5000 });
      } else {
        toast.error(`0 de ${toSync.length} órdenes sincronizadas`, { position: "bottom-left", duration: 5000 });
      }
    }

    // Re-verify synchronized orders to update their status (only if there were successes)
    if (allSuccessfulOrders.length > 0) {
      await verifyBatch(allSuccessfulOrders);
    }

    setIsProcessing(false);
    setIsCancelling(false);
    return { success: totalSuccess, failed: totalFailed, skipped: 0, wasCancelled };
  }, [records, selectedRecords, updateRecord, updateRecordsBatch, setIsProcessing, setProgress, synchronizeBatchMutation, verifyBatch, clientKey, batchConfigQuery.data]);

  return { verifyBatch, synchronizeBatch, cancelProcess, isCancelling };
}
