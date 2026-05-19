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

// Parallel execution config for OC verification
const OC_PARALLEL_GROUP_SIZE = 4;  // Max concurrent API calls per group
const OC_GROUP_DELAY_MS = 2000;    // Delay between groups (ms)

// Network error patterns that qualify for retry (ECONNRESET, socket hang up, etc.)
const isNetworkError = (msg: string) =>
  msg.includes("ECONNRESET") ||
  msg.includes("socket hang up") ||
  msg.includes("ECONNREFUSED") ||
  msg.includes("ETIMEDOUT") ||
  msg.includes("ENOTFOUND") ||
  msg.includes("network") ||
  msg.includes("fetch failed");

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

    // Build individual batches
    const allBatches: OCRecord[][] = [];
    for (let i = 0; i < targets.length; i += batchSize) {
      allBatches.push(targets.slice(i, i + batchSize));
    }

    // Group batches into parallel groups of OC_PARALLEL_GROUP_SIZE
    const parallelGroups: OCRecord[][][] = [];
    for (let i = 0; i < allBatches.length; i += OC_PARALLEL_GROUP_SIZE) {
      parallelGroups.push(allBatches.slice(i, i + OC_PARALLEL_GROUP_SIZE));
    }

    const totalGroups = parallelGroups.length;

    // Accumulate batches that failed due to network errors for final retry
    const networkRetryBatches: OCRecord[][] = [];

    for (let groupIdx = 0; groupIdx < totalGroups; groupIdx++) {
      if (cancelRef.current) {
        wasCancelled = true;
        // Mark remaining unprocessed records back to "pending"
        const processedSoFar = groupIdx * OC_PARALLEL_GROUP_SIZE * batchSize;
        const remainingTargets = targets.slice(processedSoFar);
        const pendingUpdates = remainingTargets.map(r => ({
          id: r.id,
          updates: { status: "pending" as const, statusMessage: "Cancelado por el usuario" }
        }));
        updateRecordsBatch(pendingUpdates);
        break;
      }

      const group = parallelGroups[groupIdx];

      // Mark all records in this group as checking
      const groupCheckingUpdates = group.flat().map(r => ({
        id: r.id,
        updates: { statusMessage: `Verificando... (grupo ${groupIdx + 1} de ${totalGroups})` }
      }));
      updateRecordsBatch(groupCheckingUpdates);

      // Helper to process a single batch and return updates + summary delta
      const processBatch = async (batchTargets: OCRecord[], batchLabel: string) => {
        try {
          const result = await verifyBatchMutation.mutateAsync({
            orders: batchTargets.map(r => ({
              purchaseOrderId: r.purchase_order_number,
              providerExternalCode1: r.provider_external_code_1 || r.provider_external_code || "",
              providerExternalCode2: r.provider_external_code_2 || "",
              buyerCode: r.buyer_external_code,
            })),
            clientKey: clientKey || undefined,
            isFirstBatch: groupIdx === 0,
            isLastBatch: groupIdx === totalGroups - 1,
            globalSummary: groupIdx === totalGroups - 1 ? globalSummary : undefined,
          });

          const batchUpdates: Array<{ id: string; updates: Partial<OCRecord> }> = [];
          const summaryDelta = { total: 0, found: 0, not_found: 0, supplier_not_exists: 0, errors: 0 };

          for (let i = 0; i < batchTargets.length; i++) {
            const target = batchTargets[i];
            const apiResult = result.results[i];

            if (!apiResult) {
              batchUpdates.push({ id: target.id, updates: { status: "error", statusMessage: "Sin resultado del servidor" } });
              summaryDelta.errors++;
              summaryDelta.total++;
              continue;
            }

            const canceledStr = apiResult.canceled != null ? String(apiResult.canceled).trim().toUpperCase() : "";
            const isCanceled = apiResult.status === "found"
              && canceledStr !== ""
              && canceledStr !== "NO"
              && canceledStr !== "0"
              && canceledStr !== "FALSE";

            let resolvedStatus: OCRecord["status"];
            let resolvedMessage: string;
            if (apiResult.status === "found") {
              if (isCanceled) {
                resolvedStatus = "canceled";
                resolvedMessage = "Anulada";
              } else {
                resolvedStatus = "synced";
                resolvedMessage = `Sincronizada (${apiResult.syncStatus})`;
              }
              summaryDelta.found++;
            } else if (apiResult.status === "not_found") {
              resolvedStatus = "not_found";
              resolvedMessage = "OC no encontrada";
              summaryDelta.not_found++;
            } else if (apiResult.status === "supplier_not_exists") {
              resolvedStatus = "supplier_not_exists";
              resolvedMessage = "Proveedor no existe";
              summaryDelta.supplier_not_exists++;
            } else {
              resolvedStatus = "error";
              resolvedMessage = apiResult.error || "Error";
              summaryDelta.errors++;
            }
            summaryDelta.total++;

            batchUpdates.push({
              id: target.id,
              updates: {
                status: resolvedStatus,
                statusMessage: resolvedMessage,
                ...(apiResult.status === "found" ? {
                  buyer_name: apiResult.buyerName || target.buyer_name,
                  provider_name: apiResult.providerName || target.provider_name,
                  document_date: apiResult.documentDate || undefined,
                  synchronization_date: apiResult.synchronizationDate || undefined,
                  synchronization_date2: (apiResult as any).synchronizationDate2 || undefined,
                  manual_date_synch: (apiResult as any).manualDateSynch || undefined,
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

          // Accumulate summary from API response
          if (result.summary) {
            summaryDelta.total = result.summary.total;
            summaryDelta.found = result.summary.found;
            summaryDelta.not_found = result.summary.not_found;
            summaryDelta.supplier_not_exists = result.summary.supplier_not_exists;
            summaryDelta.errors = result.summary.errors;
          }

          return { updates: batchUpdates, summaryDelta, count: batchTargets.length, error: null };
        } catch (err: any) {
          const errorMsg = err?.message || "Error desconocido";
          // Propagate critical errors immediately
          if (
            errorMsg.includes("COMMUNICATION_FAILURE_TOKEN") ||
            errorMsg.includes("COMMUNICATION_FAILURE_SERVICE") ||
            errorMsg.includes("NO_CONNECTION_503")
          ) {
            throw err;
          }
          const errorUpdates = batchTargets.map(r => ({
            id: r.id,
            updates: { status: "error" as const, statusMessage: `Error ${batchLabel}: ${errorMsg}` },
          }));
          toast.error(`Error en ${batchLabel}: ${errorMsg}`, { position: "bottom-left", duration: 5000 });
          return {
            updates: errorUpdates,
            summaryDelta: { total: batchTargets.length, found: 0, not_found: 0, supplier_not_exists: 0, errors: batchTargets.length },
            count: batchTargets.length,
            error: errorMsg,
            isNetworkError: isNetworkError(errorMsg),
            batchTargets,
          };
        }
      };

      try {
        // Run all batches in this group in parallel
        const groupResults = await Promise.all(
          group.map((batchTargets, bIdx) =>
            processBatch(batchTargets, `lote ${groupIdx * OC_PARALLEL_GROUP_SIZE + bIdx + 1} de ${totalBatches}`)
          )
        );

        // Apply all updates and accumulate summaries; collect network-failed batches for retry
        for (const res of groupResults) {
          updateRecordsBatch(res.updates);
          globalSummary.total += res.summaryDelta.total;
          globalSummary.found += res.summaryDelta.found;
          globalSummary.not_found += res.summaryDelta.not_found;
          globalSummary.supplier_not_exists += res.summaryDelta.supplier_not_exists;
          globalSummary.errors += res.summaryDelta.errors;
          processedCount += res.count;
          // Queue network-failed batches for final retry
          if (res.error && (res as any).isNetworkError && (res as any).batchTargets) {
            networkRetryBatches.push((res as any).batchTargets as OCRecord[]);
          }
        }
        setProgress({ current: processedCount, total: targets.length });

      } catch (err: any) {
        const errorMsg = err?.message || "Error desconocido";
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
      }

      // Wait OC_GROUP_DELAY_MS between groups (skip after last group)
      if (groupIdx < totalGroups - 1 && !cancelRef.current) {
        toast.info(
          `Esperando ${OC_GROUP_DELAY_MS / 1000}s antes del grupo ${groupIdx + 2} de ${totalGroups}...`,
          { position: "bottom-left", duration: OC_GROUP_DELAY_MS }
        );
        await delay(OC_GROUP_DELAY_MS);
      }
    }

    // --- Final retry for network-failed batches (ECONNRESET / socket hang up) ---
    // processBatch is defined inside the groupIdx loop, so we replicate a minimal retry call here
    if (!wasCancelled && networkRetryBatches.length > 0) {
      const retryTargets = networkRetryBatches.flat();
      toast.info(
        `Reintentando ${retryTargets.length} registros que fallaron por error de red...`,
        { position: "bottom-left", duration: 5000 }
      );
      await delay(2000);

      // Mark retry targets as checking again
      updateRecordsBatch(retryTargets.map(r => ({
        id: r.id,
        updates: { status: "checking" as const, statusMessage: "Reintentando por error de red..." }
      })));

      // Run all retry batches in parallel (single group) — inline retry logic
      const retryResults = await Promise.all(
        networkRetryBatches.map(async (retryBatch, idx) => {
          const retryLabel = `reintento ${idx + 1} de ${networkRetryBatches.length}`;
          try {
            const result = await verifyBatchMutation.mutateAsync({
              orders: retryBatch.map(r => ({
                purchaseOrderId: r.purchase_order_number,
                providerExternalCode1: r.provider_external_code_1 || r.provider_external_code || "",
                providerExternalCode2: r.provider_external_code_2 || "",
                buyerCode: r.buyer_external_code,
              })),
              clientKey: clientKey || undefined,
              isFirstBatch: false,
              isLastBatch: true,
            });
            const updates: Array<{ id: string; updates: Partial<OCRecord> }> = [];
            const summaryDelta = { total: 0, found: 0, not_found: 0, supplier_not_exists: 0, errors: 0 };
            for (let i = 0; i < retryBatch.length; i++) {
              const target = retryBatch[i];
              const apiResult = result.results[i];
              if (!apiResult) {
                updates.push({ id: target.id, updates: { status: "error", statusMessage: "Sin resultado (reintento)" } });
                summaryDelta.errors++; summaryDelta.total++;
                continue;
              }
              const canceledStr = apiResult.canceled != null ? String(apiResult.canceled).trim().toUpperCase() : "";
              const isCanceled = apiResult.status === "found" && canceledStr !== "" && canceledStr !== "NO" && canceledStr !== "0" && canceledStr !== "FALSE";
              let resolvedStatus: OCRecord["status"];
              let resolvedMessage: string;
              if (apiResult.status === "found") {
                resolvedStatus = isCanceled ? "canceled" : "synced";
                resolvedMessage = isCanceled ? "Anulada" : `Sincronizada (${apiResult.syncStatus})`;
                summaryDelta.found++;
              } else if (apiResult.status === "not_found") {
                resolvedStatus = "not_found"; resolvedMessage = "OC no encontrada"; summaryDelta.not_found++;
              } else if (apiResult.status === "supplier_not_exists") {
                resolvedStatus = "supplier_not_exists"; resolvedMessage = "Proveedor no existe"; summaryDelta.supplier_not_exists++;
              } else {
                resolvedStatus = "error"; resolvedMessage = apiResult.error || "Error"; summaryDelta.errors++;
              }
              summaryDelta.total++;
              updates.push({ id: target.id, updates: { status: resolvedStatus, statusMessage: resolvedMessage } });
            }
            return { updates, summaryDelta, originalCount: retryBatch.length };
          } catch (retryErr: any) {
            const retryErrMsg = retryErr?.message || "Error desconocido";
            toast.error(`Error en ${retryLabel}: ${retryErrMsg}`, { position: "bottom-left", duration: 5000 });
            return {
              updates: retryBatch.map(r => ({ id: r.id, updates: { status: "error" as const, statusMessage: `Error reintento: ${retryErrMsg}` } })),
              summaryDelta: { total: retryBatch.length, found: 0, not_found: 0, supplier_not_exists: 0, errors: retryBatch.length },
              originalCount: retryBatch.length,
            };
          }
        })
      );

      for (const res of retryResults) {
        updateRecordsBatch(res.updates);
        // Adjust global summary: subtract the errors counted in the first pass, add retry results
        globalSummary.errors = Math.max(0, globalSummary.errors - res.originalCount) + res.summaryDelta.errors;
        globalSummary.found += res.summaryDelta.found;
        globalSummary.not_found += res.summaryDelta.not_found;
        globalSummary.supplier_not_exists += res.summaryDelta.supplier_not_exists;
        const retrySucceeded = res.summaryDelta.errors < res.originalCount;
        if (retrySucceeded) {
          toast.success(`Reintento exitoso: ${res.originalCount - res.summaryDelta.errors} registros recuperados`, { position: "bottom-left", duration: 4000 });
        }
      }
      setProgress({ current: processedCount, total: targets.length });
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
    const PARALLEL_GROUP_SIZE = 4;  // Same as verification: 4 batches in parallel
    const GROUP_DELAY_MS = 2000;    // 2s pause between groups
    const totalBatches = Math.ceil(toSync.length / batchSize);
    const totalGroups = Math.ceil(totalBatches / PARALLEL_GROUP_SIZE);

    setIsProcessing(true);
    setProgress({ current: 0, total: toSync.length });

    if (totalBatches > 1) {
      toast.info(
        `Sincronizando ${toSync.length} registros en ${totalBatches} lotes de ${batchSize} · ${totalGroups} grupos de ${PARALLEL_GROUP_SIZE} en paralelo`,
        { position: "bottom-left", duration: 5000 }
      );
    }

    let totalSuccess = 0;
    let totalFailed = 0;
    let processedCount = 0;
    let wasCancelled = false;
    const allSuccessfulOrders: OCRecord[] = [];
    // Accumulate batches that failed due to network errors for final retry
    const syncNetworkRetryBatches: OCRecord[][] = [];

    // Build all batches upfront
    const batches: OCRecord[][] = [];
    for (let i = 0; i < totalBatches; i++) {
      batches.push(toSync.slice(i * batchSize, Math.min((i + 1) * batchSize, toSync.length)));
    }

    // Process in groups of PARALLEL_GROUP_SIZE
    for (let groupIndex = 0; groupIndex < totalGroups; groupIndex++) {
      if (cancelRef.current) {
        wasCancelled = true;
        break;
      }

      const groupStart = groupIndex * PARALLEL_GROUP_SIZE;
      const groupEnd = Math.min(groupStart + PARALLEL_GROUP_SIZE, totalBatches);
      const groupBatches = batches.slice(groupStart, groupEnd);

      // Execute all batches in this group in parallel
      const groupResults = await Promise.allSettled(
        groupBatches.map(async (batchTargets, localIdx) => {
          const globalBatchIdx = groupStart + localIdx;
          try {
            const result = await synchronizeBatchMutation.mutateAsync({
              orders: batchTargets.map(r => ({
                buyerExternalCode: r.buyer_external_code,
                purchaseOrderNumber: r.purchase_order_number,
                sendEmails: true,
              })),
              clientKey: clientKey || undefined,
            });
            return { batchTargets, result, globalBatchIdx };
          } catch (err: any) {
            return { batchTargets, error: err, globalBatchIdx };
          }
        })
      );

      // Process results from this group
      let commFailure: "token" | "service" | null = null;
      for (const settled of groupResults) {
        if (settled.status === "fulfilled") {
          const { batchTargets, result, error, globalBatchIdx } = settled.value as any;

          if (error) {
            const syncErrMsg = error?.message || "Error al sincronizar";
            if (syncErrMsg.includes("COMMUNICATION_FAILURE_TOKEN")) {
              commFailure = "token";
              break;
            } else if (syncErrMsg.includes("COMMUNICATION_FAILURE_SERVICE")) {
              commFailure = "service";
              break;
            }
            // Queue network errors for final retry instead of marking as failed
            if (isNetworkError(syncErrMsg)) {
              syncNetworkRetryBatches.push(batchTargets);
              toast.warning(`Error de red en lote sync ${globalBatchIdx + 1}: se reintentará al final`, { position: "bottom-left", duration: 4000 });
            } else {
              toast.error(`Error en lote sync ${globalBatchIdx + 1}: ${syncErrMsg}`, { position: "bottom-left", duration: 5000 });
              const errorUpdates = batchTargets.map((r: OCRecord) => ({
                id: r.id,
                updates: { statusMessage: `Error lote sync ${globalBatchIdx + 1}: ${syncErrMsg}` },
              }));
              updateRecordsBatch(errorUpdates);
              totalFailed += batchTargets.length;
            }
            processedCount += batchTargets.length;
          } else {
            totalSuccess += result.summary.success;
            totalFailed += result.summary.failed;
            for (let i = 0; i < batchTargets.length; i++) {
              const record = batchTargets[i];
              const syncResult = result.results[i];
              if (syncResult && !syncResult.success) {
                const httpCode = syncResult.httpStatus ? `[HTTP ${syncResult.httpStatus}] ` : '';
                const apiMsg = syncResult.errorMessage || syncResult.error || "Error al sincronizar";
                updateRecord(record.id, { statusMessage: `${httpCode}${apiMsg}` });
              } else if (syncResult?.success) {
                allSuccessfulOrders.push(record);
              }
            }
            processedCount += batchTargets.length;
          }
          setProgress({ current: processedCount, total: toSync.length });
        }
      }

      if (commFailure) {
        (window as any).__showCommFailure?.(commFailure);
        setIsProcessing(false);
        setIsCancelling(false);
        return { success: totalSuccess, failed: totalFailed + (toSync.length - processedCount), skipped: 0, wasCancelled: false };
      }

      // Pause 2s between groups (not after last group)
      if (groupIndex < totalGroups - 1 && !cancelRef.current) {
        toast.info(
          `Grupo sync ${groupIndex + 1}/${totalGroups} completado. Esperando 2s...`,
          { position: "bottom-left", duration: GROUP_DELAY_MS }
        );
        await delay(GROUP_DELAY_MS);
      }
    }

    setProgress({ current: processedCount, total: toSync.length });

    // --- Final retry for network-failed sync batches (ECONNRESET / socket hang up) ---
    if (!wasCancelled && syncNetworkRetryBatches.length > 0) {
      const syncRetryTargets = syncNetworkRetryBatches.flat();
      toast.info(
        `Reintentando sincronización de ${syncRetryTargets.length} registros que fallaron por error de red...`,
        { position: "bottom-left", duration: 5000 }
      );
      await delay(2000);

      const syncRetryResults = await Promise.allSettled(
        syncNetworkRetryBatches.map(async (retryBatch, idx) => {
          try {
            const result = await synchronizeBatchMutation.mutateAsync({
              orders: retryBatch.map(r => ({
                buyerExternalCode: r.buyer_external_code,
                purchaseOrderNumber: r.purchase_order_number,
                sendEmails: true,
              })),
              clientKey: clientKey || undefined,
            });
            return { retryBatch, result };
          } catch (retryErr: any) {
            return { retryBatch, error: retryErr };
          }
        })
      );

      for (const settled of syncRetryResults) {
        if (settled.status === "fulfilled") {
          const { retryBatch, result, error } = settled.value as any;
          if (error) {
            const retryErrMsg = error?.message || "Error";
            toast.error(`Reintento sync fallido: ${retryErrMsg}`, { position: "bottom-left", duration: 5000 });
            updateRecordsBatch(retryBatch.map((r: OCRecord) => ({
              id: r.id,
              updates: { statusMessage: `Error reintento sync: ${retryErrMsg}` },
            })));
            totalFailed += retryBatch.length;
          } else {
            totalSuccess += result.summary.success;
            totalFailed += result.summary.failed;
            for (let i = 0; i < retryBatch.length; i++) {
              const record = retryBatch[i];
              const syncResult = result.results[i];
              if (syncResult?.success) {
                allSuccessfulOrders.push(record);
              } else if (syncResult && !syncResult.success) {
                const httpCode = syncResult.httpStatus ? `[HTTP ${syncResult.httpStatus}] ` : '';
                const apiMsg = syncResult.errorMessage || syncResult.error || "Error al sincronizar";
                updateRecord(record.id, { statusMessage: `${httpCode}${apiMsg}` });
              }
            }
            if (result.summary.success > 0) {
              toast.success(`Reintento sync exitoso: ${result.summary.success} registros sincronizados`, { position: "bottom-left", duration: 4000 });
            }
          }
        }
      }
    }

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
      toast.info(
        `El proceso de sincronización ha finalizado. Verificando el estado actualizado de ${allSuccessfulOrders.length} órdenes en el portal...`,
        { position: "bottom-left", duration: 6000 }
      );
      // Brief pause so the user reads the message before verification starts
      await delay(2000);
      await verifyBatch(allSuccessfulOrders);
    }

    setIsProcessing(false);
    setIsCancelling(false);
    return { success: totalSuccess, failed: totalFailed, skipped: 0, wasCancelled };
  }, [records, selectedRecords, updateRecord, updateRecordsBatch, setIsProcessing, setProgress, synchronizeBatchMutation, verifyBatch, clientKey, batchConfigQuery.data]);

  return { verifyBatch, synchronizeBatch, cancelProcess, isCancelling };
}
