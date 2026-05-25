// Hook para verificación y sincronización por lotes de OC
// Toda la lógica de batches, cancelación y reintentos se mantiene igual.
// Solo cambian las llamadas de red: tRPC → api.ts (Supabase + Edge Function)
import { useCallback, useRef, useState } from "react";
import { useOCSync, type OCRecord } from "@/contexts/OCSyncContext";
import { useClientKey } from "@/contexts/ClientKeyContext";
import { useQuery } from "@tanstack/react-query";
import { testToken, getBatchConfig, verifyPurchaseOrders, synchronizeBatch } from "@/lib/api";
import { toast } from "sonner";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const OC_PARALLEL_GROUP_SIZE = 4;
const OC_GROUP_DELAY_MS = 2000;

const isNetworkError = (msg: string) =>
  msg.includes("ECONNRESET") ||
  msg.includes("socket hang up") ||
  msg.includes("ECONNREFUSED") ||
  msg.includes("ETIMEDOUT") ||
  msg.includes("ENOTFOUND") ||
  msg.includes("network") ||
  msg.includes("fetch failed");

export function useOCVerification() {
  const { records, updateRecord, updateRecordsBatch, setIsProcessing, setProgress, selectedRecords } =
    useOCSync();
  const { clientKey } = useClientKey();
  const cancelRef = useRef(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const { data: batchConfigData } = useQuery({
    queryKey: ["batchConfig", clientKey],
    queryFn: () => getBatchConfig(clientKey!),
    enabled: !!clientKey,
    staleTime: 60_000,
  });

  const cancelProcess = useCallback(() => {
    cancelRef.current = true;
    setIsCancelling(true);
  }, []);

  // ── verifyBatch ────────────────────────────────────────────────────────────

  const verifyBatch = useCallback(
    async (recordsToVerify?: OCRecord[]) => {
      const targets = recordsToVerify || records.filter((r) => selectedRecords.has(r.id));
      if (targets.length === 0) {
        toast.warning("No hay registros seleccionados para verificar", { position: "bottom-left" });
        return;
      }

      cancelRef.current = false;
      setIsCancelling(false);

      // Test connectivity first
      try {
        const tokenResult = await testToken(clientKey || "");
        if (!tokenResult.success) {
          (window as unknown as Record<string, unknown>).__showCommFailure?.("token");
          return;
        }
      } catch {
        (window as unknown as Record<string, unknown>).__showCommFailure?.("token");
        return;
      }

      const batchSize = batchConfigData?.batchSize ?? 10;
      const batchDelaySeconds = batchConfigData?.batchDelaySeconds ?? 3;
      const syncRules = batchConfigData?.syncRules ?? null;
      const totalBatches = Math.ceil(targets.length / batchSize);

      setIsProcessing(true);
      setProgress({ current: 0, total: targets.length });

      updateRecordsBatch(
        targets.map((r) => ({
          id: r.id,
          updates: { status: "checking" as const, statusMessage: "En cola de verificación..." },
        }))
      );

      if (totalBatches > 1) {
        toast.info(
          `Procesando ${targets.length} registros en ${totalBatches} lotes de ${batchSize} (espera ${batchDelaySeconds}s entre lotes)`,
          { position: "bottom-left", duration: 5000 }
        );
      }

      const globalSummary = { total: 0, found: 0, not_found: 0, supplier_not_exists: 0, errors: 0 };
      let processedCount = 0;
      let wasCancelled = false;
      const networkRetryBatches: OCRecord[][] = [];

      const allBatches: OCRecord[][] = [];
      for (let i = 0; i < targets.length; i += batchSize) allBatches.push(targets.slice(i, i + batchSize));

      const parallelGroups: OCRecord[][][] = [];
      for (let i = 0; i < allBatches.length; i += OC_PARALLEL_GROUP_SIZE)
        parallelGroups.push(allBatches.slice(i, i + OC_PARALLEL_GROUP_SIZE));

      const totalGroups = parallelGroups.length;

      const processBatch = async (batchTargets: OCRecord[], batchLabel: string) => {
        try {
          const result = await verifyPurchaseOrders(
            clientKey || "",
            batchTargets.map((r) => ({
              purchaseOrderId: r.purchase_order_number,
              providerExternalCode1: r.provider_external_code_1 || r.provider_external_code || "",
              providerExternalCode2: r.provider_external_code_2 || "",
              buyerCode: r.buyer_external_code,
            })),
            false,
            globalSummary
          );

          const batchUpdates: Array<{ id: string; updates: Partial<OCRecord> }> = [];
          const summaryDelta = { total: 0, found: 0, not_found: 0, supplier_not_exists: 0, errors: 0 };

          for (let i = 0; i < batchTargets.length; i++) {
            const target = batchTargets[i];
            const apiResult = result.results[i] as Record<string, unknown> | undefined;

            if (!apiResult) {
              batchUpdates.push({ id: target.id, updates: { status: "error", statusMessage: "Sin resultado del servidor" } });
              summaryDelta.errors++;
              summaryDelta.total++;
              continue;
            }

            const canceledStr = apiResult.canceled != null ? String(apiResult.canceled).trim().toUpperCase() : "";
            const isCanceled =
              apiResult.status === "found" &&
              canceledStr !== "" &&
              canceledStr !== "NO" &&
              canceledStr !== "0" &&
              canceledStr !== "FALSE";

            let resolvedStatus: OCRecord["status"];
            let resolvedMessage: string;

            if (apiResult.status === "found") {
              resolvedStatus = isCanceled ? "canceled" : "synced";
              resolvedMessage = isCanceled ? "Anulada" : `Sincronizada (${apiResult.syncStatus})`;
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
              resolvedMessage = (apiResult.error as string) || "Error";
              summaryDelta.errors++;
            }
            summaryDelta.total++;

            batchUpdates.push({
              id: target.id,
              updates: {
                status: resolvedStatus,
                statusMessage: resolvedMessage,
                ...(apiResult.status === "found"
                  ? {
                      buyer_name: (apiResult.buyerName as string) || target.buyer_name,
                      provider_name: (apiResult.providerName as string) || target.provider_name,
                      document_date: (apiResult.documentDate as string) || undefined,
                      synchronization_date: (apiResult.synchronizationDate as string) || undefined,
                      delivery_status: (apiResult.deliveryStatus as string) || undefined,
                      canceled: apiResult.canceled != null ? String(apiResult.canceled) : undefined,
                      updated: apiResult.updated != null ? String(apiResult.updated) : undefined,
                      portalData: {
                        buyerName: (apiResult.buyerName as string) || "",
                        providerCode: (apiResult.providerExternalCode1 as string) || "",
                        providerName: (apiResult.providerName as string) || "",
                        documentDate: (apiResult.documentDate as string) || "",
                        deliveryStatus: (apiResult.deliveryStatus as string) || "",
                        canceled: apiResult.canceled != null ? String(apiResult.canceled) : "",
                        updated: apiResult.updated != null ? String(apiResult.updated) : "",
                        synchronizationDate: (apiResult.synchronizationDate as string) || "",
                      },
                    }
                  : {}),
              },
            });
          }

          return { updates: batchUpdates, summaryDelta, count: batchTargets.length, error: null };
        } catch (e: unknown) {
          const errorMsg = e instanceof Error ? e.message : "Error desconocido";
          if (
            errorMsg.includes("COMMUNICATION_FAILURE_TOKEN") ||
            errorMsg.includes("COMMUNICATION_FAILURE_SERVICE")
          ) {
            throw e;
          }
          const errorUpdates = batchTargets.map((r) => ({
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

      for (let groupIdx = 0; groupIdx < totalGroups; groupIdx++) {
        if (cancelRef.current) {
          wasCancelled = true;
          const remaining = targets.slice(groupIdx * OC_PARALLEL_GROUP_SIZE * batchSize);
          updateRecordsBatch(
            remaining.map((r) => ({ id: r.id, updates: { status: "pending" as const, statusMessage: "Cancelado" } }))
          );
          break;
        }

        const group = parallelGroups[groupIdx];
        updateRecordsBatch(
          group
            .flat()
            .map((r) => ({ id: r.id, updates: { statusMessage: `Verificando... (grupo ${groupIdx + 1}/${totalGroups})` } }))
        );

        try {
          const groupResults = await Promise.all(
            group.map((batchTargets, bIdx) =>
              processBatch(batchTargets, `lote ${groupIdx * OC_PARALLEL_GROUP_SIZE + bIdx + 1}/${totalBatches}`)
            )
          );

          for (const res of groupResults) {
            updateRecordsBatch(res.updates);
            globalSummary.total += res.summaryDelta.total;
            globalSummary.found += res.summaryDelta.found;
            globalSummary.not_found += res.summaryDelta.not_found;
            globalSummary.supplier_not_exists += res.summaryDelta.supplier_not_exists;
            globalSummary.errors += res.summaryDelta.errors;
            processedCount += res.count;
            if (res.error && (res as Record<string, unknown>).isNetworkError && (res as Record<string, unknown>).batchTargets) {
              networkRetryBatches.push((res as Record<string, unknown>).batchTargets as OCRecord[]);
            }
          }
          setProgress({ current: processedCount, total: targets.length });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "";
          if (msg.includes("COMMUNICATION_FAILURE_TOKEN")) {
            (window as unknown as Record<string, unknown>).__showCommFailure?.("token");
          } else {
            (window as unknown as Record<string, unknown>).__showCommFailure?.("service");
          }
          setIsProcessing(false);
          setIsCancelling(false);
          return;
        }

        if (groupIdx < totalGroups - 1 && !cancelRef.current) {
          toast.info(`Esperando ${OC_GROUP_DELAY_MS / 1000}s antes del grupo ${groupIdx + 2}/${totalGroups}...`, {
            position: "bottom-left",
            duration: OC_GROUP_DELAY_MS,
          });
          await delay(OC_GROUP_DELAY_MS);
        }
      }

      // Final network retry
      if (!wasCancelled && networkRetryBatches.length > 0) {
        const retryTargets = networkRetryBatches.flat();
        toast.info(`Reintentando ${retryTargets.length} registros que fallaron por error de red...`, {
          position: "bottom-left",
          duration: 5000,
        });
        await delay(2000);
        updateRecordsBatch(
          retryTargets.map((r) => ({ id: r.id, updates: { status: "checking" as const, statusMessage: "Reintentando..." } }))
        );

        const retryResults = await Promise.all(
          networkRetryBatches.map((batch) => processBatch(batch, "reintento"))
        );
        for (const res of retryResults) {
          updateRecordsBatch(res.updates);
        }
        setProgress({ current: processedCount, total: targets.length });
      }

      const cancelledCount = targets.length - processedCount;
      const s = globalSummary;

      if (wasCancelled) {
        toast.warning(
          `Verificación cancelada: ${processedCount}/${targets.length} procesados. ${cancelledCount} pendientes.`,
          { position: "bottom-left", duration: 10000 }
        );
      } else {
        toast.success(
          `Verificación completada: ${s.found} sincronizadas, ${s.not_found} no encontradas, ${s.supplier_not_exists} proveedor no existe, ${s.errors} errores`,
          { position: "bottom-left", duration: 8000 }
        );
      }

      if (syncRules && (s.not_found > 0 || s.supplier_not_exists > 0)) {
        toast.info(`Reglas de sincronización: ${syncRules}`, { position: "bottom-left", duration: 10000 });
      }

      setProgress({ current: processedCount, total: targets.length });
      setIsProcessing(false);
      setIsCancelling(false);
      return { wasCancelled, processedCount, cancelledCount };
    },
    [records, selectedRecords, updateRecordsBatch, setIsProcessing, setProgress, clientKey, batchConfigData]
  );

  // ── synchronizeBatch ──────────────────────────────────────────────────────

  const synchronizeBatchFn = useCallback(
    async (recordsToSync?: OCRecord[]) => {
      const toSync = recordsToSync || records.filter((r) => selectedRecords.has(r.id));
      if (toSync.length === 0) {
        toast.warning("No hay registros seleccionados para sincronizar", { position: "bottom-left" });
        return { success: 0, failed: 0, skipped: 0, wasCancelled: false };
      }

      cancelRef.current = false;
      setIsCancelling(false);

      try {
        const tokenResult = await testToken(clientKey || "");
        if (!tokenResult.success) {
          (window as unknown as Record<string, unknown>).__showCommFailure?.("token");
          return { success: 0, failed: 0, skipped: 0, wasCancelled: false };
        }
      } catch {
        (window as unknown as Record<string, unknown>).__showCommFailure?.("token");
        return { success: 0, failed: 0, skipped: 0, wasCancelled: false };
      }

      const batchSize = batchConfigData?.batchSize ?? 10;
      const PARALLEL_GROUP_SIZE = 4;
      const GROUP_DELAY_MS = 2000;
      const totalBatches = Math.ceil(toSync.length / batchSize);
      const totalGroups = Math.ceil(totalBatches / PARALLEL_GROUP_SIZE);

      setIsProcessing(true);
      setProgress({ current: 0, total: toSync.length });

      if (totalBatches > 1) {
        toast.info(`Sincronizando ${toSync.length} registros en ${totalBatches} lotes`, {
          position: "bottom-left",
          duration: 5000,
        });
      }

      let totalSuccess = 0;
      let totalFailed = 0;
      let processedCount = 0;
      let wasCancelled = false;
      const allSuccessfulOrders: OCRecord[] = [];
      const syncNetworkRetryBatches: OCRecord[][] = [];

      const batches: OCRecord[][] = [];
      for (let i = 0; i < totalBatches; i++) {
        batches.push(toSync.slice(i * batchSize, Math.min((i + 1) * batchSize, toSync.length)));
      }

      for (let groupIndex = 0; groupIndex < totalGroups; groupIndex++) {
        if (cancelRef.current) { wasCancelled = true; break; }

        const groupStart = groupIndex * PARALLEL_GROUP_SIZE;
        const groupBatches = batches.slice(groupStart, Math.min(groupStart + PARALLEL_GROUP_SIZE, totalBatches));

        const groupResults = await Promise.allSettled(
          groupBatches.map(async (batchTargets, localIdx) => {
            const globalBatchIdx = groupStart + localIdx;
            try {
              const result = await synchronizeBatch(
                clientKey || "",
                batchTargets.map((r) => ({
                  buyerExternalCode: r.buyer_external_code,
                  purchaseOrderNumber: r.purchase_order_number,
                  sendEmails: true,
                }))
              );
              return { batchTargets, result, globalBatchIdx };
            } catch (e: unknown) {
              return { batchTargets, error: e, globalBatchIdx };
            }
          })
        );

        for (const settled of groupResults) {
          if (settled.status === "fulfilled") {
            const v = settled.value as Record<string, unknown>;
            if (v.error) {
              const syncErrMsg = (v.error as Error).message || "Error";
              if (syncErrMsg.includes("COMMUNICATION_FAILURE_TOKEN")) {
                (window as unknown as Record<string, unknown>).__showCommFailure?.("token");
                setIsProcessing(false);
                setIsCancelling(false);
                return { success: totalSuccess, failed: totalFailed, skipped: 0, wasCancelled: false };
              }
              if (isNetworkError(syncErrMsg)) {
                syncNetworkRetryBatches.push(v.batchTargets as OCRecord[]);
              } else {
                toast.error(`Error en lote sync ${Number(v.globalBatchIdx) + 1}: ${syncErrMsg}`, { position: "bottom-left" });
                updateRecordsBatch(
                  (v.batchTargets as OCRecord[]).map((r) => ({ id: r.id, updates: { statusMessage: syncErrMsg } }))
                );
                totalFailed += (v.batchTargets as OCRecord[]).length;
              }
              processedCount += (v.batchTargets as OCRecord[]).length;
            } else {
              const result = v.result as Awaited<ReturnType<typeof synchronizeBatch>>;
              totalSuccess += result.summary.success;
              totalFailed += result.summary.failed;
              for (let i = 0; i < (v.batchTargets as OCRecord[]).length; i++) {
                const record = (v.batchTargets as OCRecord[])[i];
                const syncResult = result.results[i];
                if (syncResult && !syncResult.success) {
                  const httpCode = syncResult.httpStatus ? `[HTTP ${syncResult.httpStatus}] ` : "";
                  updateRecord(record.id, { statusMessage: `${httpCode}${syncResult.errorMessage || syncResult.error || "Error"}` });
                } else if (syncResult?.success) {
                  allSuccessfulOrders.push(record);
                }
              }
              processedCount += (v.batchTargets as OCRecord[]).length;
            }
            setProgress({ current: processedCount, total: toSync.length });
          }
        }

        if (groupIndex < totalGroups - 1 && !cancelRef.current) {
          toast.info(`Grupo sync ${groupIndex + 1}/${totalGroups} completado. Esperando 2s...`, {
            position: "bottom-left",
            duration: GROUP_DELAY_MS,
          });
          await delay(GROUP_DELAY_MS);
        }
      }

      // Retry network failures
      if (!wasCancelled && syncNetworkRetryBatches.length > 0) {
        const retryTargets = syncNetworkRetryBatches.flat();
        toast.info(`Reintentando sincronización de ${retryTargets.length} registros por error de red...`, {
          position: "bottom-left",
          duration: 5000,
        });
        await delay(2000);
        const retryResults = await Promise.allSettled(
          syncNetworkRetryBatches.map(async (batch) => {
            try {
              const result = await synchronizeBatch(
                clientKey || "",
                batch.map((r) => ({ buyerExternalCode: r.buyer_external_code, purchaseOrderNumber: r.purchase_order_number, sendEmails: true }))
              );
              return { batch, result };
            } catch (e: unknown) {
              return { batch, error: e };
            }
          })
        );
        for (const settled of retryResults) {
          if (settled.status === "fulfilled") {
            const v = settled.value as Record<string, unknown>;
            if (v.error) {
              totalFailed += (v.batch as OCRecord[]).length;
            } else {
              const result = v.result as Awaited<ReturnType<typeof synchronizeBatch>>;
              totalSuccess += result.summary.success;
              totalFailed += result.summary.failed;
            }
          }
        }
      }

      const cancelledCount = toSync.length - processedCount;
      if (wasCancelled) {
        toast.warning(`Sincronización cancelada: ${processedCount}/${toSync.length} procesados. ${cancelledCount} no procesados.`, {
          position: "bottom-left",
          duration: 10000,
        });
      } else if (totalSuccess === toSync.length) {
        toast.success(`${totalSuccess}/${toSync.length} órdenes sincronizadas correctamente`, { position: "bottom-left" });
      } else if (totalSuccess > 0) {
        toast.warning(`${totalSuccess}/${toSync.length} órdenes sincronizadas correctamente`, { position: "bottom-left" });
      } else {
        toast.error(`0/${toSync.length} órdenes sincronizadas`, { position: "bottom-left" });
      }

      if (allSuccessfulOrders.length > 0) {
        toast.info(`Verificando estado actualizado de ${allSuccessfulOrders.length} órdenes en el portal...`, {
          position: "bottom-left",
          duration: 6000,
        });
        await delay(2000);
        await verifyBatch(allSuccessfulOrders);
      }

      setIsProcessing(false);
      setIsCancelling(false);
      return { success: totalSuccess, failed: totalFailed, skipped: 0, wasCancelled };
    },
    [records, selectedRecords, updateRecord, updateRecordsBatch, setIsProcessing, setProgress, verifyBatch, clientKey, batchConfigData]
  );

  return { verifyBatch, synchronizeBatch: synchronizeBatchFn, cancelProcess, isCancelling };
}
