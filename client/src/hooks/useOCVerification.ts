/**
 * Hook para verificación y sincronización por lotes de OC
 * Implementa la lógica de negocio:
 * 1. Verificar si la OC existe en el portal
 * 2. Si no existe, verificar si el proveedor existe
 * 3. Regla: buyer != "0230" → provider_external_code_1, buyer == "0230" → provider_external_code_2
 */
import { useCallback } from "react";
import { useOCSync, type OCRecord } from "@/contexts/OCSyncContext";
import { egixiaApi } from "@/lib/egixia-api";

const BATCH_SIZE = 5; // Concurrent requests per batch
const DELAY_BETWEEN_BATCHES = 300; // ms

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function useOCVerification() {
  const { records, updateRecord, setIsProcessing, setProgress, apiConfig } = useOCSync();

  const verifyBatch = useCallback(async (recordsToVerify?: OCRecord[]) => {
    const targets = recordsToVerify || records.filter(r => r.status === "pending" || !r.status);
    if (targets.length === 0) return;

    egixiaApi.configure(apiConfig.baseUrl, apiConfig.token);
    setIsProcessing(true);
    setProgress({ current: 0, total: targets.length });

    let processed = 0;

    // Process in batches
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      
      // Mark batch as checking
      batch.forEach(r => updateRecord(r.id, { status: "checking" }));

      // Process batch concurrently
      const promises = batch.map(async (record) => {
        try {
          const result = await egixiaApi.checkOC(
            record.buyer_external_code,
            record.purchase_order_number
          );

          if (result.SDTOrdenesCompra && result.SDTOrdenesCompra.length > 0) {
            const oc = result.SDTOrdenesCompra[0];
            updateRecord(record.id, {
              status: "synced",
              statusMessage: "OC encontrada en el portal",
              buyer_name: oc.buyer_name,
              provider_name: oc.provider_name,
            });
          } else {
            // OC not found - check if provider exists
            await checkProviderForRecord(record);
          }
        } catch (err: any) {
          // Check if it's a "not found" type response or actual error
          const errMsg = err?.message || "Error desconocido";
          if (errMsg.includes("404") || errMsg.includes("not found")) {
            await checkProviderForRecord(record);
          } else {
            updateRecord(record.id, {
              status: "error",
              statusMessage: `Error de sistema: ${errMsg}`,
            });
          }
        }
      });

      await Promise.allSettled(promises);
      processed += batch.length;
      setProgress({ current: processed, total: targets.length });

      if (i + BATCH_SIZE < targets.length) {
        await sleep(DELAY_BETWEEN_BATCHES);
      }
    }

    setIsProcessing(false);
  }, [records, apiConfig, updateRecord, setIsProcessing, setProgress]);

  const checkProviderForRecord = useCallback(async (record: OCRecord) => {
    try {
      const isBuyer0230 = record.buyer_external_code === "0230";
      const providerCode = record.provider_external_code;

      if (!providerCode) {
        updateRecord(record.id, {
          status: "not_found",
          statusMessage: "OC no registrada en el portal. Sin código de proveedor para verificar.",
          provider_exists: undefined,
        });
        return;
      }

      const providerRequest = {
        Provider: [{
          provider_external_code_1: isBuyer0230 ? "" : providerCode,
          provider_external_code_2: isBuyer0230 ? providerCode : "",
          ProveedorCodigoExterno3: "",
        }],
      };

      const provResult = await egixiaApi.checkProviders(providerRequest);
      
      if (provResult.outlist_provider && provResult.outlist_provider.length > 0) {
        const prov = provResult.outlist_provider[0];
        if (prov.provider_exists) {
          updateRecord(record.id, {
            status: "not_found",
            statusMessage: `OC no registrada. Proveedor ${providerCode} existe en el portal (ID: ${prov.provider_id}).`,
            provider_exists: true,
          });
        } else {
          updateRecord(record.id, {
            status: "provider_not_found",
            statusMessage: `OC no registrada. Proveedor ${providerCode} NO existe en el portal.`,
            provider_exists: false,
          });
        }
      } else {
        updateRecord(record.id, {
          status: "not_found",
          statusMessage: "OC no registrada. No se pudo verificar el proveedor.",
          provider_exists: undefined,
        });
      }
    } catch (err: any) {
      updateRecord(record.id, {
        status: "not_found",
        statusMessage: `OC no registrada. Error verificando proveedor: ${err?.message || "desconocido"}`,
      });
    }
  }, [updateRecord]);

  const syncBatch = useCallback(async (recordsToSync?: OCRecord[]) => {
    const targets = recordsToSync || records.filter(r => 
      r.status === "not_found" || r.status === "provider_not_found"
    );
    if (targets.length === 0) return;

    egixiaApi.configure(apiConfig.baseUrl, apiConfig.token);
    setIsProcessing(true);
    setProgress({ current: 0, total: targets.length });

    let processed = 0;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      batch.forEach(r => updateRecord(r.id, { status: "checking", statusMessage: "Sincronizando..." }));

      const promises = batch.map(async (record) => {
        try {
          const result = await egixiaApi.syncOC({
            buyer_external_code: record.buyer_external_code,
            purchase_order_number: record.purchase_order_number,
            send_emails: false,
          });

          const tracking = result.SDTSeguimineto;
          const hasErrors = 
            parseInt(tracking.ConErrorData || "0") > 0 ||
            parseInt(tracking.ProveedorNoExiste || "0") > 0 ||
            parseInt(tracking.CompradorNoExiste || "0") > 0;

          if (parseInt(tracking.Creadas || "0") > 0 || parseInt(tracking.Actualizadas || "0") > 0) {
            updateRecord(record.id, {
              status: hasErrors ? "synced_with_error" : "synced",
              statusMessage: result.message || "Sincronización completada",
              syncResult: tracking,
            });
          } else if (parseInt(tracking.SinProveedor || "0") > 0 || parseInt(tracking.ProveedorNoExiste || "0") > 0) {
            updateRecord(record.id, {
              status: "provider_not_found",
              statusMessage: result.message || "Proveedor no existe en el portal",
              syncResult: tracking,
            });
          } else {
            updateRecord(record.id, {
              status: "error",
              statusMessage: result.message || "Error en sincronización",
              syncResult: tracking,
            });
          }
        } catch (err: any) {
          updateRecord(record.id, {
            status: "error",
            statusMessage: `Error de sincronización: ${err?.message || "desconocido"}`,
          });
        }
      });

      await Promise.allSettled(promises);
      processed += batch.length;
      setProgress({ current: processed, total: targets.length });

      if (i + BATCH_SIZE < targets.length) {
        await sleep(DELAY_BETWEEN_BATCHES);
      }
    }

    setIsProcessing(false);
  }, [records, apiConfig, updateRecord, setIsProcessing, setProgress]);

  return { verifyBatch, syncBatch };
}
