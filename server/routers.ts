import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDefaultApiConfig, upsertApiConfig, saveVerificationLog, getVerificationHistory, getClients, getClientById, getActiveClient, createClient, updateClient, deleteClient, setActiveClient } from "./db";
import { encrypt, decrypt, maskValue } from "./encryption";
import axios from "axios";

// ===== Token management (server-side) =====
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get active client credentials (decrypted)
 * Falls back to api_configs if no client is active (for backward compatibility)
 */
async function getActiveClientCredentials(): Promise<{
  baseUrl: string;
  userName: string;
  password: string;
  clientId: string;
  clientSecret: string;
} | null> {
  // Try to get active client first
  const activeClient = await getActiveClient();
  if (activeClient) {
    return {
      baseUrl: activeClient.baseUrl,
      userName: activeClient.userName,
      password: decrypt(activeClient.password),
      clientId: decrypt(activeClient.clientId),
      clientSecret: decrypt(activeClient.clientSecret),
    };
  }

  // Fallback to legacy api_configs for backward compatibility
  const legacyConfig = await getDefaultApiConfig();
  if (legacyConfig) {
    return {
      baseUrl: legacyConfig.baseUrl,
      userName: legacyConfig.userName,
      password: legacyConfig.password,
      clientId: legacyConfig.clientId,
      clientSecret: legacyConfig.clientSecret,
    };
  }

  return null;
}

async function getToken(baseUrl: string, userName: string, password: string, clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  const url = `${cleanBaseUrl}/apimanager/access/gettoken`;

  console.log(`[Egixia] Requesting token from: ${url}`);
  console.log(`[Egixia] UserName: ${userName}, ClientId: ${clientId.substring(0, 8)}...`);

  try {
    const response = await axios.post(url, {
      UserName: userName,
      Password: password,
      ClientId: clientId,
      ClientSecret: clientSecret,
    }, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });

    console.log(`[Egixia] Token response status: ${response.status}`);
    console.log(`[Egixia] Token response data keys: ${Object.keys(response.data || {}).join(", ")}`);

    // Handle various response formats
    const tokenValue = response.data?.AccessToken || response.data?.access_token || response.data?.token;

    if (tokenValue) {
      cachedToken = tokenValue;
      // Token valid for 25 minutes (refresh before expiry)
      tokenExpiry = now + 25 * 60 * 1000;
      console.log(`[Egixia] Token obtained successfully: ${tokenValue.substring(0, 12)}...`);
      return cachedToken!;
    }

    // If we got a response but no token, log the full response for debugging
    const errorMessage = response.data?.Message || response.data?.message || response.data?.error || "Token no encontrado en la respuesta";
    console.error(`[Egixia] Token error: ${errorMessage}`);
    console.error(`[Egixia] Full response data: ${JSON.stringify(response.data).substring(0, 500)}`);
    throw new Error(errorMessage);
  } catch (error: any) {
    if (error.response) {
      // HTTP error response
      const statusCode = error.response.status;
      const errorData = error.response.data;
      const errorMsg = errorData?.Message || errorData?.message || errorData?.error || `HTTP ${statusCode}`;
      console.error(`[Egixia] Token HTTP error ${statusCode}: ${errorMsg}`);
      console.error(`[Egixia] Response data: ${JSON.stringify(errorData).substring(0, 500)}`);
      throw new Error(`${errorMsg}`);
    } else if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error(`[Egixia] Connection error: ${error.code} - ${error.message}`);
      throw new Error(`No se pudo conectar al servidor: ${cleanBaseUrl}`);
    } else if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      console.error(`[Egixia] Timeout error: ${error.message}`);
      throw new Error("Tiempo de espera agotado al conectar con el servidor");
    } else if (error.message) {
      // Already formatted error from above
      throw error;
    } else {
      console.error(`[Egixia] Unknown error:`, error);
      throw new Error("Error desconocido al obtener token");
    }
  }
}

function invalidateToken() {
  cachedToken = null;
  tokenExpiry = 0;
}

async function callEgixiaApi(method: "get" | "post", endpoint: string, config: {
  baseUrl: string;
  userName: string;
  password: string;
  clientId: string;
  clientSecret: string;
}, params?: Record<string, string>, body?: unknown): Promise<{ data: unknown; status: number }> {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  let token = await getToken(baseUrl, config.userName, config.password, config.clientId, config.clientSecret);

  const makeRequest = async (tkn: string) => {
    const url = `${baseUrl}/${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${tkn}`,
    };

    if (method === "get") {
      return axios.get(url, { headers, params, timeout: 30000 });
    } else {
      return axios.post(url, body, { headers, timeout: 30000 });
    }
  };

  try {
    const response = await makeRequest(token);
    return { data: response.data, status: response.status };
  } catch (error: any) {
    // Handle 401 - token expired, retry with new token
    if (error?.response?.status === 401) {
      console.log("[Egixia] Token expired (401), refreshing...");
      invalidateToken();
      token = await getToken(baseUrl, config.userName, config.password, config.clientId, config.clientSecret);
      const response = await makeRequest(token);
      return { data: response.data, status: response.status };
    }
    // Handle 403 - permission denied
    if (error?.response?.status === 403) {
      const errorData = error.response.data;
      const message = errorData?.error?.message || errorData?.Message || "No autorizado: Acceso denegado.";
      console.error(`[Egixia] Permission denied (403) for "${endpoint}": ${message}`);
      throw new Error(`Servicio "${endpoint}" no tiene permisos: ${message}`);
    }
    throw error;
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ===== Egixia API Proxy =====
  egixia: router({
    // Get current API config (masked)
    getConfig: publicProcedure.query(async () => {
      try {
        const config = await getDefaultApiConfig();
        if (!config) {
          console.log("[Egixia] No default API config found in database");
          return { configured: false, baseUrl: "", userName: "", hasCredentials: false };
        }
        console.log(`[Egixia] Config found: ${config.baseUrl}, user: ${config.userName}`);
        return {
          configured: true,
          baseUrl: config.baseUrl,
          userName: config.userName,
          hasCredentials: true,
        };
      } catch (error: any) {
        console.error("[Egixia] Error reading config:", error?.message);
        return { configured: false, baseUrl: "", userName: "", hasCredentials: false };
      }
    }),

    // Test connection with stored credentials
    testConnection: publicProcedure
      .input(z.object({
        baseUrl: z.string().optional(),
        userName: z.string().optional(),
        password: z.string().optional(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
      }).optional().nullable())
      .mutation(async ({ input }) => {
        let config: { baseUrl: string; userName: string; password: string; clientId: string; clientSecret: string };

        if (input?.baseUrl && input?.userName && input?.password && input?.clientId && input?.clientSecret) {
          config = {
            baseUrl: input.baseUrl,
            userName: input.userName,
            password: input.password,
            clientId: input.clientId,
            clientSecret: input.clientSecret,
          };
        } else {
          console.log("[Egixia] testConnection: using active client credentials");
          const stored = await getActiveClientCredentials();
          if (!stored) {
            console.log("[Egixia] testConnection: no active client found");
            return { success: false, message: "No hay cliente activo configurado. Configure un cliente primero." };
          }
          config = stored;
        }

        try {
          invalidateToken();
          const token = await getToken(config.baseUrl, config.userName, config.password, config.clientId, config.clientSecret);
          return { success: true, message: "Conexión exitosa", tokenPreview: token.substring(0, 12) + "..." };
        } catch (error: any) {
          const msg = error?.message || "Error de conexión desconocido";
          console.error("[Egixia] testConnection failed:", msg);
          return { success: false, message: msg };
        }
      }),

    // Save API config
    saveConfig: publicProcedure
      .input(z.object({
        baseUrl: z.string(),
        userName: z.string(),
        password: z.string(),
        clientId: z.string(),
        clientSecret: z.string(),
      }))
      .mutation(async ({ input }) => {
        console.log(`[Egixia] saveConfig: testing connection to ${input.baseUrl}`);
        // Test connection first
        try {
          invalidateToken();
          await getToken(input.baseUrl, input.userName, input.password, input.clientId, input.clientSecret);
        } catch (error: any) {
          const msg = error?.message || "Error";
          console.error("[Egixia] saveConfig: connection test failed:", msg);
          return { success: false, message: "No se pudo conectar con las credenciales proporcionadas: " + msg };
        }

        // Save to DB
        try {
          await upsertApiConfig(input);
          console.log("[Egixia] saveConfig: config saved successfully");
          return { success: true, message: "Configuración guardada exitosamente" };
        } catch (error: any) {
          console.error("[Egixia] saveConfig: failed to save:", error?.message);
          return { success: false, message: "Error al guardar la configuración: " + (error?.message || "Error de base de datos") };
        }
      }),

    // Verify a single purchase order
    verifyOC: publicProcedure
      .input(z.object({
        buyerCode: z.string(),
        purchaseOrderNumber: z.string(),
      }))
      .mutation(async ({ input }) => {
        const config = await getActiveClientCredentials();
        if (!config) {
          return { success: false, error: "No hay cliente activo configurado. Configure un cliente primero.", status: "error" as const };
        }

        try {
          const result = await callEgixiaApi("get", "apimanager/purchase_order_v1/list", config, {
            buyer_external_code: input.buyerCode,
            purchase_order_number: input.purchaseOrderNumber,
          });

          const data = result.data as any;
          const orders = data?.SDTOrdenesCompra || [];

          if (orders.length > 0) {
            const oc = orders[0];
            return {
              success: true,
              status: "synced" as const,
              data: {
                buyerCode: oc.buyer_external_code,
                buyerName: oc.buyer_name,
                providerCode: oc.provider_external_code,
                providerName: oc.provider_name,
                purchaseOrderNumber: oc.purchase_order_number,
                documentDate: oc.document_date,
                deliveryStatus: oc.delivery_status,
                canceled: oc.canceled,
                updated: oc.updated,
                synchronizationDate: oc.synchronization_date,
              },
            };
          } else {
            return { success: true, status: "not_found" as const, data: null };
          }
        } catch (error: any) {
          return { success: false, status: "error" as const, error: error?.message || "Error al verificar OC" };
        }
      }),

    // Verify batch of purchase orders
    verifyBatch: publicProcedure
      .input(z.object({
        records: z.array(z.object({
          buyerCode: z.string(),
          supplierCode: z.string(),
          purchaseOrderNumber: z.string(),
        })),
      }))
      .mutation(async ({ input }) => {
        const config = await getActiveClientCredentials();
        if (!config) {
          return { success: false, error: "No hay cliente activo configurado. Configure un cliente primero.", results: [] as any[] };
        }

        console.log(`[Egixia] verifyBatch: starting verification of ${input.records.length} records`);
        const startTime = Date.now();
        const results: Array<{
          buyerCode: string;
          supplierCode: string;
          purchaseOrderNumber: string;
          status: "synced" | "not_found" | "supplier_not_exists" | "error" | "pending";
          statusDetail: string;
          portalData?: {
            buyerName: string;
            providerCode: string;
            providerName: string;
            documentDate: string;
            deliveryStatus: string;
            canceled: string;
            updated: string;
            synchronizationDate: string;
          };
        }> = [];

        // Step 1: Verify all OCs in parallel batches of 5
        const batchSize = 5;
        for (let i = 0; i < input.records.length; i += batchSize) {
          const batch = input.records.slice(i, i + batchSize);
          const batchResults = await Promise.allSettled(
            batch.map(async (record) => {
              try {
                const result = await callEgixiaApi("get", "apimanager/purchase_order_v1/list", config, {
                  buyer_external_code: record.buyerCode.trim(),
                  purchase_order_number: record.purchaseOrderNumber.trim(),
                });

                const data = result.data as any;
                const orders = data?.SDTOrdenesCompra || [];

                if (orders.length > 0) {
                  const oc = orders[0];
                  return {
                    ...record,
                    status: "synced" as const,
                    statusDetail: `Sincronizada - ${oc.delivery_status || "Sin estado"}`,
                    portalData: {
                      buyerName: oc.buyer_name || "",
                      providerCode: oc.provider_external_code || "",
                      providerName: oc.provider_name || "",
                      documentDate: oc.document_date || "",
                      deliveryStatus: oc.delivery_status || "",
                      canceled: oc.canceled || "",
                      updated: oc.updated || "",
                      synchronizationDate: oc.synchronization_date || "",
                    },
                  };
                } else {
                  return {
                    ...record,
                    status: "not_found" as const,
                    statusDetail: "OC no encontrada en el portal",
                  };
                }
              } catch (error: any) {
                return {
                  ...record,
                  status: "error" as const,
                  statusDetail: error?.message || "Error al verificar",
                };
              }
            })
          );

          for (const result of batchResults) {
            if (result.status === "fulfilled") {
              results.push(result.value);
            } else {
              results.push({
                buyerCode: "",
                supplierCode: "",
                purchaseOrderNumber: "",
                status: "error",
                statusDetail: result.reason?.message || "Error desconocido",
              });
            }
          }
        }

        // Step 2: For not_found OCs, verify if the supplier exists
        const notFoundRecords = results.filter(r => r.status === "not_found");
        if (notFoundRecords.length > 0) {
          console.log(`[Egixia] verifyBatch: checking suppliers for ${notFoundRecords.length} not-found OCs`);
          const uniqueSuppliers = Array.from(new Set(notFoundRecords.map(r => r.supplierCode).filter(Boolean)));

          const supplierExistsMap = new Map<string, boolean>();

          for (let i = 0; i < uniqueSuppliers.length; i += batchSize) {
            const supplierBatch = uniqueSuppliers.slice(i, i + batchSize);
            const supplierResults = await Promise.allSettled(
              supplierBatch.map(async (supplierCode) => {
                try {
                  const result = await callEgixiaApi("post", "ApiManager/suppliers_v3/supplier_exists", config, undefined, [{
                    provider_external_code_1: supplierCode.trim(),
                    provider_external_code_2: "",
                    provider_external_code_3: "",
                  }]);

                  const data = result.data as any;
                  const providers = data?.outlist_provider || [];
                  const message = data?.Message || "";
                  const ratedMatch = message.match(/rated (\d+)/);
                  const ratedCount = ratedMatch ? parseInt(ratedMatch[1]) : 0;

                  const exists = providers.length > 0 || ratedCount > 0;
                  console.log(`[Egixia] Supplier ${supplierCode}: exists=${exists}, providers=${providers.length}, rated=${ratedCount}`);
                  return { code: supplierCode, exists };
                } catch (error: any) {
                  if (error?.message?.includes("No autorizado") || error?.message?.includes("Acceso denegado") || error?.message?.includes("no tiene permisos")) {
                    console.error(`[Egixia] Supplier check permission error: ${error.message}`);
                    return { code: supplierCode, exists: null, permissionError: error.message };
                  }
                  console.error(`[Egixia] Supplier check error for ${supplierCode}: ${error?.message}`);
                  return { code: supplierCode, exists: null };
                }
              })
            );

            for (const result of supplierResults) {
              if (result.status === "fulfilled") {
                if (result.value.exists === false) {
                  supplierExistsMap.set(result.value.code, false);
                } else if (result.value.exists === true) {
                  supplierExistsMap.set(result.value.code, true);
                }
              }
            }
          }

          // Update status for not_found records where supplier doesn't exist
          for (const record of results) {
            if (record.status === "not_found" && record.supplierCode) {
              const exists = supplierExistsMap.get(record.supplierCode);
              if (exists === false) {
                record.status = "supplier_not_exists";
                record.statusDetail = `Proveedor ${record.supplierCode} no existe en el portal`;
              }
            }
          }
        }

        const executionTimeMs = Date.now() - startTime;

        // Save verification log
        const synced = results.filter(r => r.status === "synced").length;
        const notFound = results.filter(r => r.status === "not_found").length;
        const supplierNotExists = results.filter(r => r.status === "supplier_not_exists").length;
        const errors = results.filter(r => r.status === "error").length;

        console.log(`[Egixia] verifyBatch complete: total=${results.length}, synced=${synced}, notFound=${notFound}, supplierNotExists=${supplierNotExists}, errors=${errors}, time=${executionTimeMs}ms`);

        try {
          await saveVerificationLog({
            totalRecords: results.length,
            synced,
            notFound,
            supplierNotExists,
            errors,
            executionTimeMs,
          });
        } catch (e) {
          console.warn("[VerificationLog] Failed to save:", e);
        }

        return {
          success: true,
          results,
          summary: { total: results.length, synced, notFound, supplierNotExists, errors, executionTimeMs },
        };
      }),

    // Check supplier exists
    checkSupplier: publicProcedure
      .input(z.object({
        supplierCode: z.string(),
      }))
      .mutation(async ({ input }) => {
        const config = await getActiveClientCredentials();
        if (!config) {
          return { success: false, error: "No hay cliente activo configurado." };
        }

        try {
          const result = await callEgixiaApi("post", "ApiManager/suppliers_v3/supplier_exists", config, undefined, {
            Provider: [{
              provider_external_code_1: input.supplierCode,
              provider_external_code_2: "",
              ProveedorCodigoExterno3: "",
            }],
          });

          const data = result.data as any;
          const providers = data?.outlist_provider || [];
          const message = data?.Message || "";

          return { success: true, exists: providers.length > 0, message, providers };
        } catch (error: any) {
          return { success: false, error: error?.message || "Error al verificar proveedor" };
        }
      }),

    getVerificationHistory: publicProcedure
      .query(async () => {
        const logs = await getVerificationHistory(20);
        return logs.map(log => ({
          id: log.id,
          totalRecords: log.totalRecords,
          syncedCount: log.synced,
          notFoundCount: log.notFound,
          supplierNotExistsCount: log.supplierNotExists,
          errorCount: log.errors,
          durationMs: log.executionTimeMs,
          executedAt: log.createdAt,
        }));
      }),
  }),

  // ===== Clients router =====
  clients: router({
    list: publicProcedure
      .query(async () => {
        const allClients = await getClients();
        // Return clients with masked sensitive data
        return allClients.map(client => ({
          id: client.id,
          name: client.name,
          baseUrl: client.baseUrl,
          userName: client.userName,
          passwordMasked: maskValue(decrypt(client.password)),
          clientIdMasked: maskValue(decrypt(client.clientId)),
          clientSecretMasked: maskValue(decrypt(client.clientSecret)),
          primaryColor: client.primaryColor,
          isActive: client.isActive,
          createdAt: client.createdAt,
          updatedAt: client.updatedAt,
        }));
      }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const client = await getClientById(input.id);
        if (!client) return null;
        
        // Return with decrypted values for editing
        return {
          id: client.id,
          name: client.name,
          baseUrl: client.baseUrl,
          userName: client.userName,
          password: decrypt(client.password),
          clientId: decrypt(client.clientId),
          clientSecret: decrypt(client.clientSecret),
          primaryColor: client.primaryColor,
          isActive: client.isActive,
        };
      }),

    getActive: publicProcedure
      .query(async () => {
        const client = await getActiveClient();
        if (!client) return null;
        
        return {
          id: client.id,
          name: client.name,
          baseUrl: client.baseUrl,
          userName: client.userName,
          primaryColor: client.primaryColor,
          isActive: client.isActive,
        };
      }),

    create: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        baseUrl: z.string().url(),
        userName: z.string().min(1),
        password: z.string().min(1),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        isActive: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        // Encrypt sensitive fields
        const encryptedData = {
          name: input.name,
          baseUrl: input.baseUrl.replace(/\/$/, ""), // Remove trailing slash
          userName: input.userName,
          password: encrypt(input.password),
          clientId: encrypt(input.clientId),
          clientSecret: encrypt(input.clientSecret),
          primaryColor: input.primaryColor,
          isActive: input.isActive,
        };

        await createClient(encryptedData);
        return { success: true };
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        baseUrl: z.string().url().optional(),
        userName: z.string().min(1).optional(),
        password: z.string().min(1).optional(),
        clientId: z.string().min(1).optional(),
        clientSecret: z.string().min(1).optional(),
        primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        
        // Encrypt sensitive fields if provided
        const updateData: any = {};
        if (data.name) updateData.name = data.name;
        if (data.baseUrl) updateData.baseUrl = data.baseUrl.replace(/\/$/, "");
        if (data.userName) updateData.userName = data.userName;
        if (data.password) updateData.password = encrypt(data.password);
        if (data.clientId) updateData.clientId = encrypt(data.clientId);
        if (data.clientSecret) updateData.clientSecret = encrypt(data.clientSecret);
        if (data.primaryColor) updateData.primaryColor = data.primaryColor;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;

        await updateClient(id, updateData);
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteClient(input.id);
        return { success: true };
      }),

    setActive: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await setActiveClient(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
