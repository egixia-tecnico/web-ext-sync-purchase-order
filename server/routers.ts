import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDefaultApiConfig, upsertApiConfig, saveVerificationLog, getVerificationHistory, getClients, getClientById, getClientByKey, getActiveClient, createClient, updateClient, deleteClient, setActiveClient, createMagicLink, getMagicLinkByToken, markMagicLinkAsUsed } from "./db";
import { encrypt, decrypt, maskValue } from "./encryption";
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
        password: decrypt(client.password),
        clientId: decrypt(client.clientId),
        clientSecret: decrypt(client.clientSecret),
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
      password: decrypt(activeClient.password),
      clientId: decrypt(activeClient.clientId),
      clientSecret: decrypt(activeClient.clientSecret),
      clientName: activeClient.name,
      primaryColor: activeClient.primaryColor,
      syncRules: activeClient.syncRules,
    };
  }

  // Priority 3: Fallback to legacy api_configs for backward compatibility
  console.log("[getClientCredentials] No active client, trying legacy config...");
  const legacyConfig = await getDefaultApiConfig();
  console.log("[getClientCredentials] Legacy config:", legacyConfig ? "found" : "not found");
  if (legacyConfig) {
    return {
      baseUrl: legacyConfig.baseUrl,
      userName: legacyConfig.userName,
      password: legacyConfig.password,
      clientId: legacyConfig.clientId,
      clientSecret: legacyConfig.clientSecret,
      clientName: "Legacy Config",
      primaryColor: "#10b981",
      syncRules: null,
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

  try {
    const response = await axios.post(
      url,
      { username: userName, password, client_id: clientId, client_secret: clientSecret },
      { headers: { "Content-Type": "application/json" }, timeout: 30000 }
    );

    if (response.status !== 200) {
      console.error("[Egixia] Token HTTP error", response.status, ":", response.statusText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = response.data;
    if (!data?.access_token) {
      console.error("[Egixia] Token response missing access_token:", data);
      throw new Error("Respuesta inválida del servidor (sin access_token)");
    }

    cachedToken = data.access_token;
    const expiresIn = data.expires_in || 3600;
    tokenExpiry = now + expiresIn * 1000 - 60000;

    console.log("[Egixia] Token obtained, expires in", expiresIn, "seconds");
    return cachedToken!;
  } catch (err: any) {
    console.error("[Egixia] Token request failed:", err.message);
    cachedToken = null;
    tokenExpiry = 0;
    throw new Error(`Error al obtener token: ${err.message}`);
  }
}

async function callEgixiaApi(endpoint: string, method: "GET" | "POST" = "GET", body?: any, clientKey?: string): Promise<any> {
  const credentials = await getClientCredentials(clientKey);
  if (!credentials) {
    throw new Error("No hay configuración de API disponible. Configure un cliente primero.");
  }

  const { baseUrl, userName, password, clientId, clientSecret } = credentials;
  const token = await getToken(baseUrl, userName, password, clientId, clientSecret);
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  const url = `${cleanBaseUrl}${endpoint}`;

  console.log(`[Egixia] Calling ${method} ${url}`);

  try {
    const response = await axios({
      method,
      url,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: body,
      timeout: 30000,
    });

    if (response.status !== 200) {
      console.error(`[Egixia] API HTTP error ${response.status}:`, response.statusText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.data;
  } catch (err: any) {
    console.error(`[Egixia] API call failed:`, err.message);
    throw new Error(`Error en llamada a API: ${err.message}`);
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
        origin: z.string().optional() 
      }))
      .mutation(async ({ input }) => {
        const { email } = input;
        
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
        
        return { success: true, email: magicLink.email };
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

  apiConfig: router({
    get: publicProcedure.query(async () => {
      const config = await getDefaultApiConfig();
      if (!config) return null;
      return {
        baseUrl: config.baseUrl,
        userName: config.userName,
        password: config.password,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      };
    }),

    upsert: publicProcedure
      .input(z.object({
        baseUrl: z.string().url(),
        userName: z.string().min(1),
        password: z.string().min(1),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const cleanBaseUrl = input.baseUrl.replace(/\/$/, "");
        await upsertApiConfig({ ...input, baseUrl: cleanBaseUrl });
        cachedToken = null;
        tokenExpiry = 0;
        return { success: true };
      }),

    testConnection: publicProcedure
      .input(z.object({ clientKey: z.string().optional() }))
      .mutation(async ({ input }) => {
        const credentials = await getClientCredentials(input.clientKey);
        if (!credentials) {
          throw new Error("No hay configuración de API disponible");
        }

        const { baseUrl, userName, password, clientId, clientSecret } = credentials;
        await getToken(baseUrl, userName, password, clientId, clientSecret);
        return { success: true, message: "Conexión exitosa" };
      }),
  }),

  egixia: router({
    verifyPurchaseOrders: publicProcedure
      .input(z.object({
        orders: z.array(z.object({
          purchaseOrderId: z.string(),
          supplierCode: z.string(),
          buyerCode: z.string().optional(),
        })),
        clientKey: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const results = [];
        for (const order of input.orders) {
          try {
            const data = await callEgixiaApi(
              `/apimanager/purchaseorder/getpurchaseorder?PurchaseOrderId=${order.purchaseOrderId}&SupplierCode=${order.supplierCode}`,
              "GET",
              undefined,
              input.clientKey
            );

            if (data && data.PurchaseOrderId) {
              results.push({
                purchaseOrderId: order.purchaseOrderId,
                supplierCode: order.supplierCode,
                buyerCode: order.buyerCode,
                status: "found",
                syncStatus: data.SyncStatus || "unknown",
              });
            } else {
              const supplierExists = await callEgixiaApi(
                `/apimanager/supplier/checksupplier?SupplierCode=${order.supplierCode}`,
                "GET",
                undefined,
                input.clientKey
              );

              if (supplierExists?.Exists) {
                results.push({
                  purchaseOrderId: order.purchaseOrderId,
                  supplierCode: order.supplierCode,
                  buyerCode: order.buyerCode,
                  status: "not_found",
                  syncStatus: null,
                });
              } else {
                results.push({
                  purchaseOrderId: order.purchaseOrderId,
                  supplierCode: order.supplierCode,
                  buyerCode: order.buyerCode,
                  status: "supplier_not_exists",
                  syncStatus: null,
                });
              }
            }
          } catch (error: any) {
            results.push({
              purchaseOrderId: order.purchaseOrderId,
              supplierCode: order.supplierCode,
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

    checkSupplier: publicProcedure
      .input(z.object({
        supplierCode: z.string(),
        clientKey: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const data = await callEgixiaApi(
          `/apimanager/supplier/checksupplier?SupplierCode=${input.supplierCode}`,
          "GET",
          undefined,
          input.clientKey
        );
        return { exists: data?.Exists || false };
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
        password: maskValue(decrypt(client.password)),
        clientId: maskValue(decrypt(client.clientId)),
        clientSecret: maskValue(decrypt(client.clientSecret)),
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
          password: maskValue(decrypt(client.password)),
          clientId: maskValue(decrypt(client.clientId)),
          clientSecret: maskValue(decrypt(client.clientSecret)),
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
        const encryptedData = {
          clientKey: input.clientKey,
          name: input.name,
          baseUrl: input.baseUrl.replace(/\/$/, ""),
          userName: input.userName,
          password: encrypt(input.password),
          clientId: encrypt(input.clientId),
          clientSecret: encrypt(input.clientSecret),
          primaryColor: input.primaryColor,
          syncRules: input.syncRules,
          isActive: input.isActive,
        };

        await createClient(encryptedData);
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
        if (data.password) updateData.password = encrypt(data.password);
        if (data.clientId) updateData.clientId = encrypt(data.clientId);
        if (data.clientSecret) updateData.clientSecret = encrypt(data.clientSecret);
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
        try {
          const tokenUrl = `${input.baseUrl.replace(/\/$/, "")}/gettoken`;
          const response = await axios.post(
            tokenUrl,
            {
              user: input.userName,
              password: input.password,
              clientId: input.clientId,
              clientSecret: input.clientSecret,
            },
            {
              headers: { "Content-Type": "application/json" },
              timeout: AXIOS_TIMEOUT_MS,
            }
          );

          if (response.data?.access_token) {
            return {
              success: true,
              message: "Conexión exitosa. Credenciales válidas.",
            };
          } else {
            return {
              success: false,
              message: "Respuesta inválida del servidor. No se recibió token de acceso.",
            };
          }
        } catch (error: any) {
          console.error("[Clients testConnection] Error:", error.message);
          return {
            success: false,
            message: error.response?.data?.message || error.message || "Error al conectar con el servidor",
          };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
