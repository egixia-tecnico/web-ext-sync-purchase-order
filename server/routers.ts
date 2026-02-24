import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { saveVerificationLog, getVerificationHistory, getClients, getClientById, getClientByKey, getActiveClient, createClient, updateClient, deleteClient, setActiveClient, createMagicLink, getMagicLinkByToken, markMagicLinkAsUsed, getIntegrationLogs, saveIntegrationLog, deleteIntegrationLogsByClientKey } from "./db";
import { sendMagicLinkEmail, isSendGridConfigured } from "./email";
import axios from "axios";
import { AXIOS_TIMEOUT_MS } from "@shared/const";

// ===== Token management (server-side) =====
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get client credentials by clientKey or fallback to active client
 * @param clientKey - Optional client key from URL
 * @returns Decrypted credentials or null
 */
async function getClientCredentials(clientKey?: string): Promise<{
  baseUrl: string;
  userName: string;
  password: string;
  clientId: string;
  clientSecret: string;
  clientName?: string;
  primaryColor: string;
  syncRules?: string | null;
} | null> {
  console.log("[getClientCredentials] Called with clientKey:", clientKey);
  
  // Priority 1: Use clientKey if provided
  if (clientKey) {
    const client = await getClientByKey(clientKey);
    console.log("[getClientCredentials] Client found by key:", client ? { id: client.id, name: client.name, isActive: client.isActive } : null);
    if (client) {
      // Check if client is active
      if (!client.isActive) {
        throw new Error(`Cliente "${client.name}" está suspendido. Contacte al administrador.`);
      }
      return {
        baseUrl: client.baseUrl,
        userName: client.userName,
        password: client.password,
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        clientName: client.name,
        primaryColor: client.primaryColor,
        syncRules: client.syncRules,
      };
    }
    throw new Error(`No se encontró cliente con clientKey: ${clientKey}`);
  }

  // Priority 2: Try to get active client
  console.log("[getClientCredentials] No clientKey provided, trying active client...");
  const activeClient = await getActiveClient();
  console.log("[getClientCredentials] Active client:", activeClient ? { id: activeClient.id, name: activeClient.name, isActive: activeClient.isActive } : null);
  if (activeClient) {
    if (!activeClient.isActive) {
      throw new Error(`Cliente "${activeClient.name}" está suspendido. Contacte al administrador.`);
    }
    return {
      baseUrl: activeClient.baseUrl,
      userName: activeClient.userName,
      password: activeClient.password,
      clientId: activeClient.clientId,
      clientSecret: activeClient.clientSecret,
      clientName: activeClient.name,
      primaryColor: activeClient.primaryColor,
      syncRules: activeClient.syncRules,
    };
  }

  console.log("[getClientCredentials] No credentials found, returning null");
  return null;
}

async function getToken(baseUrl: string, userName: string, password: string, clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  const url = `${cleanBaseUrl}/apimanager/access/gettoken`;

  console.log("[Egixia] Requesting new token from:", url);
  console.log("[Egixia] Request body:", JSON.stringify({ UserName: userName, Password: "***", ClientId: clientId, ClientSecret: "***" }));

  try {
    const response = await axios.post(
      url,
      { UserName: userName, Password: password, ClientId: clientId, ClientSecret: clientSecret },
      { 
        headers: { 
          "Content-Type": "application/json",
          "User-Agent": "PostmanRuntime/7.51.1"
        }, 
        timeout: 30000 
      }
    );

    if (response.status !== 200) {
      console.error("[Egixia] Token HTTP error", response.status, ":", response.statusText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = response.data;
    if (!data?.AccessToken || !data.AccessToken.trim()) {
      console.error("[Egixia] Token response missing AccessToken:", data);
      throw new Error("Respuesta inválida del servidor (sin AccessToken)");
    }

    cachedToken = data.AccessToken;
    const expiresIn = data.expires_in || 3600;
    tokenExpiry = now + expiresIn * 1000 - 60000;

    console.log("[Egixia] Token obtained, expires in", expiresIn, "seconds");
    return cachedToken!;
  } catch (err: any) {
    const httpStatus = err.response?.status;
    
    // Handle 503 Service Unavailable - server is down
    if (httpStatus === 503) {
      console.error("[Egixia] 503 Service Unavailable: No hay conexión con el servidor");
      cachedToken = null;
      tokenExpiry = 0;
      
      // Save simplified log for 503 errors
      const client = await getActiveClient(); // Get active client
      if (client) {
        await saveIntegrationLog({
          clientId: client.id,
          url: "No hay conexión",
          requestBody: undefined,
          responseBody: undefined,
          token: undefined,
          authPrefix: undefined,
          status: "error",
        });
      }
      
      throw new Error("NO_CONNECTION_503"); // Special error code for frontend
    }
    
    console.error("[Egixia] Token request failed:", err.message);
    console.error("[Egixia] HTTP Status:", httpStatus);
    console.error("[Egixia] Response data:", err.response?.data);
    console.error("[Egixia] Response headers:", err.response?.headers);
    cachedToken = null;
    tokenExpiry = 0;
    throw new Error(`Error al obtener token: ${err.message}`);
  }
}

async function callEgixiaApi(endpoint: string, method: "GET" | "POST" = "GET", body?: any, clientKey?: string, retryOn401 = true): Promise<any> {
  const credentials = await getClientCredentials(clientKey);
  if (!credentials) {
    throw new Error("No hay configuración de API disponible. Configure un cliente primero.");
  }

  const { baseUrl, userName, password, clientId, clientSecret } = credentials;
  let token = await getToken(baseUrl, userName, password, clientId, clientSecret);
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  const url = `${cleanBaseUrl}${endpoint}`;

  console.log(`[Egixia] Calling ${method} ${url}`);

  let responseData: any;
  let status = "success";

  try {
    const response = await axios({
      method,
      url,
      headers: { 
        Authorization: `Bearer ${token}`, 
        "Content-Type": "application/json",
        "User-Agent": "PostmanRuntime/7.51.1"
      },
      data: body,
      timeout: 30000,
    });

    if (response.status !== 200) {
      console.error(`[Egixia] API HTTP error ${response.status}:`, response.statusText);
      status = "error";
      responseData = { error: response.statusText, status: response.status };
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    responseData = response.data;
    return response.data;
  } catch (err: any) {
    const httpStatus = err.response?.status;
    
    // Handle 401 Unauthorized - token expired, retry once with new token
    if (httpStatus === 401 && retryOn401) {
      console.log(`[Egixia] 401 Unauthorized, refreshing token and retrying...`);
      cachedToken = null; // Clear cached token
      tokenExpiry = 0;
      token = await getToken(baseUrl, userName, password, clientId, clientSecret);
      return await callEgixiaApi(endpoint, method, body, clientKey, false); // Retry once without further 401 retries
    }
    
    // Handle 403 Forbidden - insufficient permissions
    if (httpStatus === 403) {
      const serviceName = endpoint.split('/').pop() || endpoint;
      status = "error";
      responseData = { error: "Forbidden", status: 403 };
      throw new Error(`Hacen falta permisos para ejecutar el servicio ${serviceName}`);
    }
    
    console.error(`[Egixia] API call failed:`, err.message);
    status = err.code === 'ECONNABORTED' ? "timeout" : "error";
    responseData = { error: err.message, code: err.code, status: httpStatus };
    throw new Error(`Error en llamada a API: ${err.message}`);
  } finally {
    // Save integration log (exclude gettoken endpoint)
    if (!endpoint.includes("/gettoken")) {
      const client = await getClientByKey(clientKey || "");
      if (client) {
        await saveIntegrationLog({
          clientId: client.id,
          url,
          requestBody: body ? JSON.stringify(body) : undefined,
          responseBody: responseData ? JSON.stringify(responseData) : undefined,
          token,
          authPrefix: "Bearer",
          status,
        });
      }
    }
  }
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      ctx.res.setHeader("Set-Cookie", `session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      return { success: true };
    }),
    
    sendMagicLink: publicProcedure
      .input(z.object({ 
        email: z.string().email(),
        origin: z.string().optional(),
        returnPath: z.string().optional() 
      }))
      .mutation(async ({ input }) => {
        const { email, returnPath } = input;
        
        // Validate @egixia.com domain
        if (!email.endsWith("@egixia.com")) {
          throw new Error("Solo se permiten correos @egixia.com");
        }
        
        // Generate random token
        const token = Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join("");
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        
        // Save magic link to database
        await createMagicLink({
          email,
          token,
          returnPath: returnPath || null,
          expiresAt,
          used: false,
        });
        
        // Construct callback URL (use origin from frontend or fallback to localhost)
        const frontendUrl = input.origin || "http://localhost:3000";
        const callbackUrl = `${frontendUrl}/admin/callback?token=${token}`;
        
        // Send email with magic link
        if (isSendGridConfigured()) {
          const emailSent = await sendMagicLinkEmail(email, token, callbackUrl);
          if (!emailSent) {
            throw new Error("Error al enviar el correo. Por favor inténtalo de nuevo.");
          }
          return { success: true, message: "Link mágico enviado a tu correo" };
        } else {
          // Fallback for testing: print token to console
          console.log(`[Magic Link] Token para ${email}: ${token}`);
          console.log(`[Magic Link] URL: ${callbackUrl}`);
          return { success: true, message: "Link mágico generado (revisa la consola del servidor)" };
        }
      }),
    
    validateMagicLink: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { token } = input;
        
        // Get magic link from database
        const magicLink = await getMagicLinkByToken(token);
        
        if (!magicLink) {
          throw new Error("Link inválido o expirado");
        }
        
        // Check if already used
        if (magicLink.used) {
          throw new Error("Este link ya fue utilizado");
        }
        
        // Check if expired
        if (new Date() > magicLink.expiresAt) {
          throw new Error("Este link ha expirado");
        }
        
        // Mark as used
        await markMagicLinkAsUsed(token);
        
        // Create admin session (set cookie with email)
        const sessionData = JSON.stringify({ email: magicLink.email, isAdmin: true });
        const isProduction = process.env.NODE_ENV === "production";
        const secureCookie = isProduction ? "; Secure" : "";
        ctx.res.setHeader(
          "Set-Cookie",
          `admin_session=${sessionData}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secureCookie}`
        );
        
        return { success: true, email: magicLink.email, returnPath: magicLink.returnPath };
      }),
    
    checkAdminSession: publicProcedure.query(({ ctx }) => {
      // Read admin_session cookie from request
      const cookies = ctx.req.headers.cookie || "";
      const adminSessionMatch = cookies.match(/admin_session=([^;]+)/);
      
      if (!adminSessionMatch) {
        return { isAdmin: false, email: null };
      }
      
      try {
        const sessionData = JSON.parse(adminSessionMatch[1]);
        if (sessionData.isAdmin && sessionData.email && sessionData.email.endsWith("@egixia.com")) {
          return { isAdmin: true, email: sessionData.email };
        }
      } catch (e) {
        // Invalid session data
      }
      
      return { isAdmin: false, email: null };
    }),
  }),

// apiConfig router removed - all configuration now managed through clients router

  egixia: router({
    verifyPurchaseOrders: publicProcedure
      .input(z.object({
        orders: z.array(z.object({
          purchaseOrderId: z.string(),
          providerExternalCode1: z.string(),
          providerExternalCode2: z.string().optional(),
          buyerCode: z.string().optional(),
        })),
        clientKey: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Clean all integration logs for this client before verification
        if (input.clientKey) {
          await deleteIntegrationLogsByClientKey(input.clientKey);
        }
        
        const results = [];
        for (const order of input.orders) {
          try {
            const data = await callEgixiaApi(
              `/apimanager/purchase_order_v1/list?buyer_external_code=${order.buyerCode}&purchase_order_number=${order.purchaseOrderId}`,
              "GET",
              undefined,
              input.clientKey
            );

            // Check if order is synchronized (SDTOrdenesCompra has data)
            // Verify exact match of buyer_external_code and purchase_order_number
            if (data && data.SDTOrdenesCompra && Array.isArray(data.SDTOrdenesCompra) && data.SDTOrdenesCompra.length > 0) {
              const orderData = data.SDTOrdenesCompra.find(
                (oc: any) => 
                  oc.buyer_external_code === order.buyerCode && 
                  oc.purchase_order_number === order.purchaseOrderId
              );
              
              if (orderData) {
                // OC found and synchronized - NO need to check supplier
                results.push({
                  purchaseOrderId: order.purchaseOrderId,
                  providerExternalCode1: order.providerExternalCode1,
                  providerExternalCode2: order.providerExternalCode2 || "",
                  providerExternalCode3: orderData.provider_external_code3 || "",
                  buyerCode: order.buyerCode,
                  buyerName: orderData.buyer_name || null,
                  providerName: orderData.provider_name || null,
                  status: "found", // Order is synchronized
                  syncStatus: "synchronized",
                  documentDate: orderData.document_date || null,
                  synchronizationDate: orderData.synchronization_date || null,
                  deliveryStatus: orderData.delivery_status || null,
                  canceled: orderData.canceled || null,
                  updated: orderData.updated || null,
                });
              } else {
                // Response has data but no exact match - treat as not found
                // Check if supplier exists
                const supplierExists = await callEgixiaApi(
                  `/ApiManager/suppliers_v3/supplier_exists`,
                  "POST",
                  [{
                    provider_external_code_1: order.providerExternalCode1,
                    provider_external_code_2: order.providerExternalCode2 || "",
                    provider_external_code_3: ""
                  }],
                  input.clientKey
                );

                if (!supplierExists?.outlist_provider || supplierExists.outlist_provider.length === 0) {
                  // Invalid response from supplier_exists endpoint
                  results.push({
                    purchaseOrderId: order.purchaseOrderId,
                    providerExternalCode1: order.providerExternalCode1,
                    providerExternalCode2: order.providerExternalCode2 || "",
                    buyerCode: order.buyerCode,
                    status: "error",
                    syncStatus: null,
                    error: "Respuesta inválida del servicio de verificación de proveedor",
                  });
                } else if (supplierExists.outlist_provider[0]?.provider_exists === true) {
                  results.push({
                    purchaseOrderId: order.purchaseOrderId,
                    providerExternalCode1: order.providerExternalCode1,
                    providerExternalCode2: order.providerExternalCode2 || "",
                    buyerCode: order.buyerCode,
                    status: "not_found",
                    syncStatus: null,
                  });
                } else {
                  results.push({
                    purchaseOrderId: order.purchaseOrderId,
                    providerExternalCode1: order.providerExternalCode1,
                    providerExternalCode2: order.providerExternalCode2 || "",
                    buyerCode: order.buyerCode,
                    status: "supplier_not_exists",
                    syncStatus: null,
                  });
                }
              }
            } else {
              // Order not found - check if supplier exists
              const supplierExists = await callEgixiaApi(
                `/ApiManager/suppliers_v3/supplier_exists`,
                "POST",
                [{
                  provider_external_code_1: order.providerExternalCode1,
                  provider_external_code_2: order.providerExternalCode2 || "",
                  provider_external_code_3: ""
                }],
                input.clientKey
              );

              if (!supplierExists?.outlist_provider || supplierExists.outlist_provider.length === 0) {
                // Invalid response from supplier_exists endpoint
                results.push({
                  purchaseOrderId: order.purchaseOrderId,
                  providerExternalCode1: order.providerExternalCode1,
                  providerExternalCode2: order.providerExternalCode2 || "",
                  buyerCode: order.buyerCode,
                  status: "error",
                  syncStatus: null,
                  error: "Respuesta inválida del servicio de verificación de proveedor",
                });
              } else if (supplierExists.outlist_provider[0]?.provider_exists === true) {
                results.push({
                  purchaseOrderId: order.purchaseOrderId,
                  providerExternalCode1: order.providerExternalCode1,
                  providerExternalCode2: order.providerExternalCode2 || "",
                  buyerCode: order.buyerCode,
                  status: "not_found",
                  syncStatus: null,
                });
              } else {
                results.push({
                  purchaseOrderId: order.purchaseOrderId,
                  providerExternalCode1: order.providerExternalCode1,
                  providerExternalCode2: order.providerExternalCode2 || "",
                  buyerCode: order.buyerCode,
                  status: "supplier_not_exists",
                  syncStatus: null,
                });
              }
            }
          } catch (error: any) {
            results.push({
              purchaseOrderId: order.purchaseOrderId,
              providerExternalCode1: order.providerExternalCode1,
              providerExternalCode2: order.providerExternalCode2 || "",
              buyerCode: order.buyerCode,
              status: "error",
              syncStatus: null,
              error: error.message,
            });
          }
        }

        const credentials = await getClientCredentials(input.clientKey);
        const summary = {
          total: results.length,
          found: results.filter((r) => r.status === "found").length,
          not_found: results.filter((r) => r.status === "not_found").length,
          supplier_not_exists: results.filter((r) => r.status === "supplier_not_exists").length,
          errors: results.filter((r) => r.status === "error").length,
        };

        // Get clientId for logging
        let clientId: number | undefined;
        if (input.clientKey) {
          const client = await getClientByKey(input.clientKey);
          if (client) {
            clientId = client.id;
          }
        }

        await saveVerificationLog({
          clientId,
          totalRecords: summary.total,
          synced: summary.found,
          notFound: summary.not_found,
          supplierNotExists: summary.supplier_not_exists,
          errors: summary.errors,
          executionTimeMs: 0,
        });

        return {
          results,
          summary,
          clientInfo: credentials ? {
            name: credentials.clientName,
            primaryColor: credentials.primaryColor,
            syncRules: credentials.syncRules,
          } : null,
        };
      }),

    synchronizePurchaseOrder: publicProcedure
      .input(z.object({
        buyerExternalCode: z.string(),
        purchaseOrderNumber: z.string(),
        sendEmails: z.boolean().default(false),
        clientKey: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const data = await callEgixiaApi(
            `/apimanager/purchase_order_v1/synchronize_purchase_order`,
            "POST",
            {
              buyer_external_code: input.buyerExternalCode,
              purchase_order_number: input.purchaseOrderNumber,
              send_emails: input.sendEmails,
            },
            input.clientKey
          );

          // Analyze SDTSeguimineto to determine success
          const seguimiento = data?.SDTSeguimineto;
          
          if (!seguimiento) {
            return {
              success: false,
              error: "Respuesta inválida del servidor (sin SDTSeguimineto)",
              data: null,
            };
          }

          // Success: Actualizadas > 0 OR Creadas > 0
          const isSuccess = (seguimiento.Actualizadas > 0 || seguimiento.Creadas > 0);
          
          // Errors: ProveedorNoExiste, CompradorNoExiste, TotalOCs=0, AnuladasNoRegistradas
          const hasError = (
            seguimiento.ProveedorNoExiste > 0 ||
            seguimiento.CompradorNoExiste > 0 ||
            seguimiento.TotalOCs === 0 ||
            seguimiento.AnuladasNoRegistradas > 0 ||
            seguimiento.SinProveedor > 0
          );

          let errorMessage = null;
          
          // Check for "Not found Buyer." message (status 400)
          if (data.message && data.message.includes("Not found Buyer")) {
            errorMessage = "No existe la empresa compradora, verifique que el número contenga incluso los ceros a la izquierda en caso que aplique";
          } else if (seguimiento.SinProveedor > 0) {
            errorMessage = "La orden de compra trae el campo proveedor nulo";
          } else if (seguimiento.ProveedorNoExiste > 0) {
            errorMessage = "El proveedor no existe en el portal";
          } else if (seguimiento.CompradorNoExiste > 0) {
            errorMessage = "La empresa compradora no está configurada en la integración o no existe";
          } else if (seguimiento.AnuladasNoRegistradas > 0) {
            errorMessage = "La orden de compra está 100% anulada y no existía previamente en el portal";
          } else if (seguimiento.TotalOCs === 0) {
            errorMessage = "No se encontró la orden de compra en el sistema origen";
          }

          return {
            success: isSuccess && !hasError,
            message: data.message || null,
            errorMessage,
            data: seguimiento,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            data: null,
          };
        }
      }),

    checkSupplier: publicProcedure
      .input(z.object({
        supplierCode: z.string(),
        clientKey: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const data = await callEgixiaApi(
          `/ApiManager/suppliers_v3/supplier_exists`,
          "POST",
          [{
            provider_external_code_1: input.supplierCode,
            provider_external_code_2: "",
            provider_external_code_3: ""
          }],
          input.clientKey
        );
        return { exists: (data?.outlist_provider && data.outlist_provider.length > 0 && data.outlist_provider[0]?.provider_exists === true) || false };
      }),

    getVerificationHistory: publicProcedure
      .input(z.object({ clientKey: z.string().optional() }))
      .query(async ({ input }) => {
        let clientId: number | undefined;
        
        // If clientKey provided, get the client ID
        if (input.clientKey) {
          const client = await getClientByKey(input.clientKey);
          if (client) {
            clientId = client.id;
          }
        }
        
        return await getVerificationHistory(clientId);
      }),
  }),

  clients: router({
    list: publicProcedure.query(async () => {
      const clients = await getClients();
      return clients.map((client) => ({
        id: client.id,
        clientKey: client.clientKey,
        name: client.name,
        baseUrl: client.baseUrl,
        userName: client.userName,
        password: client.password,
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        primaryColor: client.primaryColor,
        syncRules: client.syncRules,
        isActive: client.isActive,
        createdAt: client.createdAt,
      }));
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const client = await getClientById(input.id);
        if (!client) return null;

        return {
          id: client.id,
          clientKey: client.clientKey,
          name: client.name,
          baseUrl: client.baseUrl,
          userName: client.userName,
          password: client.password,
          clientId: client.clientId,
          clientSecret: client.clientSecret,
          primaryColor: client.primaryColor,
          syncRules: client.syncRules,
          isActive: client.isActive,
        };
      }),

    create: publicProcedure
      .input(z.object({
        clientKey: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
        name: z.string().min(1),
        baseUrl: z.string().url(),
        userName: z.string().min(1),
        password: z.string().min(1),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        syncRules: z.string().optional(),
        isActive: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        const clientData = {
          clientKey: input.clientKey,
          name: input.name,
          baseUrl: input.baseUrl.replace(/\/$/, ""),
          userName: input.userName,
          password: input.password,
          clientId: input.clientId,
          clientSecret: input.clientSecret,
          primaryColor: input.primaryColor,
          syncRules: input.syncRules,
          isActive: input.isActive,
        };

        await createClient(clientData);
        return { success: true };
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        clientKey: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/).optional(),
        name: z.string().min(1).optional(),
        baseUrl: z.string().url().optional(),
        userName: z.string().min(1).optional(),
        password: z.string().min(1).optional(),
        clientId: z.string().min(1).optional(),
        clientSecret: z.string().min(1).optional(),
        primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        syncRules: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        
        const updateData: any = {};
        if (data.clientKey) updateData.clientKey = data.clientKey;
        if (data.name) updateData.name = data.name;
        if (data.baseUrl) updateData.baseUrl = data.baseUrl.replace(/\/$/, "");
        if (data.userName) updateData.userName = data.userName;
        if (data.password) updateData.password = data.password;
        if (data.clientId) updateData.clientId = data.clientId;
        if (data.clientSecret) updateData.clientSecret = data.clientSecret;
        if (data.primaryColor) updateData.primaryColor = data.primaryColor;
        if (data.syncRules !== undefined) updateData.syncRules = data.syncRules;
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

    getByKey: publicProcedure
      .input(z.object({ clientKey: z.string() }))
      .query(async ({ input }) => {
        const client = await getClientByKey(input.clientKey);
        if (!client) return null;

        return {
          id: client.id,
          clientKey: client.clientKey,
          name: client.name,
          baseUrl: client.baseUrl,
          userName: client.userName,
          primaryColor: client.primaryColor,
          syncRules: client.syncRules,
          isActive: client.isActive,
        };
      }),

    testConnection: publicProcedure
      .input(z.object({
        baseUrl: z.string().url(),
        userName: z.string().min(1),
        password: z.string().min(1),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const tokenUrl = `${input.baseUrl.replace(/\/$/, "")}/apimanager/access/gettoken`;
        const requestBody = {
          UserName: input.userName,
          Password: input.password,
          ClientId: input.clientId,
          ClientSecret: input.clientSecret,
        };
        const requestHeaders = { "Content-Type": "application/json" };
        const MAX_RETRIES = 3;
        const TIMEOUT_MS = 60000;
        let lastError: any = null;
        let lastResponse: any = null;
        let attempts = 0;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          attempts = attempt + 1;
          const delayMs = Math.pow(2, attempt) * 1000;

          if (attempt > 0) {
            console.log(`[Clients testConnection] Reintento ${attempt}/${MAX_RETRIES - 1}, esperando ${delayMs}ms`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }

          try {
            console.log(`[Clients testConnection] Intento ${attempts}/${MAX_RETRIES} a:`, tokenUrl);
            const response = await axios.post(tokenUrl, requestBody, {
              headers: requestHeaders,
              timeout: TIMEOUT_MS,
            });

            lastResponse = response;

            if (response.data?.AccessToken && response.data.AccessToken.trim()) {
              return {
                success: true,
                message: `Conexión exitosa en intento ${attempts}. Credenciales válidas.`,
                debug: {
                  method: "POST",
                  url: tokenUrl,
                  requestHeaders,
                  requestBody,
                  responseStatus: response.status,
                  responseData: response.data,
                  attempts,
                  totalAttempts: MAX_RETRIES,
                },
              };
            } else {
              lastError = new Error("Respuesta inválida del servidor. No se recibió token de acceso.");
              continue;
            }
          } catch (error: any) {
            lastError = error;
            console.error(`[Clients testConnection] Error en intento ${attempts}:`, error.message);
            console.error("[Clients testConnection] Status:", error.response?.status);
            console.error("[Clients testConnection] Data:", error.response?.data);

            if (error.response?.status && error.response.status >= 400 && error.response.status < 500 && error.code !== 'ECONNABORTED') {
              break;
            }

            if (attempt < MAX_RETRIES - 1) {
              continue;
            }
          }
        }

        return {
          success: false,
          message: lastError?.response?.data?.message || lastError?.message || "Error al conectar con el servidor después de múltiples intentos",
          debug: {
            method: "POST",
            url: tokenUrl,
            requestHeaders,
            requestBody,
            responseStatus: lastError?.response?.status || lastResponse?.status,
            responseData: lastError?.response?.data || lastResponse?.data,
            errorMessage: lastError?.message,
            attempts,
            totalAttempts: MAX_RETRIES,
          },
        };
      }),
  }),

  logs: router({
    getIntegrationLogs: publicProcedure
      .input(z.object({ clientKey: z.string() }))
      .query(async ({ input }) => {
        const client = await getClientByKey(input.clientKey);
        if (!client) {
          throw new Error("Cliente no encontrado");
        }
        return await getIntegrationLogs(client.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
