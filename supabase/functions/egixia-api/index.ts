// Egixia OC Sync — Supabase Edge Function
// Handles all calls to the external Egixia supplier portal API.
// Actions: test-token | verify-suppliers | verify-purchase-orders | synchronize-batch | batch-config
//
// Deploy: supabase functions deploy egixia-api
// Env vars needed (set via supabase secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injected automatically)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_TIMEOUT_MS = 70_000;

// ── helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function extractServiceName(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split("/").filter(Boolean).slice(-2).join("_");
  } catch {
    return url.split("/").filter(Boolean).slice(-2).join("_");
  }
}

// ── token management (DB-cached) ─────────────────────────────────────────────

async function getToken(
  supabase: ReturnType<typeof createClient>,
  client: Record<string, unknown>
): Promise<string> {
  // Use cached token if still valid (60s buffer)
  const expiresAt = client.token_expires_at as string | null;
  if (client.cached_token && expiresAt && new Date(expiresAt).getTime() > Date.now() + 60_000) {
    return client.cached_token as string;
  }

  // Fetch fresh token from external API
  const baseUrl = (client.base_url as string).replace(/\/$/, "");
  const tokenUrl = `${baseUrl}/apimanager/access/gettoken`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "PostmanRuntime/7.51.1" },
      body: JSON.stringify({
        UserName: client.user_name,
        Password: client.password,
        ClientId: client.client_id,
        ClientSecret: client.client_secret,
      }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) throw new Error(`COMMUNICATION_FAILURE_TOKEN: HTTP ${resp.status}`);

  const data = await resp.json();
  if (!data?.AccessToken) throw new Error("COMMUNICATION_FAILURE_TOKEN: no AccessToken in response");

  const token: string = data.AccessToken;
  const expiresIn = 3600; // 1 hour
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Persist token in DB (fire-and-forget)
  await supabase
    .from("clients")
    .update({ cached_token: token, token_expires_at: newExpiresAt })
    .eq("id", client.id);

  return token;
}

// ── external API call + integration log ──────────────────────────────────────

async function callExternalApi(
  supabase: ReturnType<typeof createClient>,
  client: Record<string, unknown>,
  endpoint: string,
  method: "GET" | "POST",
  body: unknown,
  token: string
): Promise<unknown> {
  const baseUrl = (client.base_url as string).replace(/\/$/, "");
  const url = `${baseUrl}${endpoint}`;
  const startTime = Date.now();
  let httpStatus: number | undefined;
  let responseBody: string | undefined;
  let logStatus = "success";
  let errorDetail: string | undefined;

  const reqHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "PostmanRuntime/7.51.1",
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    httpStatus = resp.status;
    responseBody = await resp.text();

    if (resp.status === 401) {
      // Invalidate cached token and signal caller to retry
      await supabase
        .from("clients")
        .update({ cached_token: null, token_expires_at: null })
        .eq("id", client.id);
      throw new Error("COMMUNICATION_FAILURE_TOKEN: 401 Unauthorized");
    }

    if (!resp.ok) {
      logStatus = "error";
      errorDetail = `HTTP ${resp.status}`;
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    // Detect HTML response (portal down / wrong URL)
    if (responseBody.trimStart().startsWith("<")) {
      logStatus = "error";
      errorDetail = `El servidor devolvió HTML. URL: ${url}`;
      throw new Error("El servidor devolvió HTML en vez de JSON. Verifique la URL base del cliente.");
    }

    const parsed = JSON.parse(responseBody);
    return parsed;
  } catch (e: unknown) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("aborted") || msg.includes("timeout")) {
      logStatus = "timeout";
      errorDetail = `Timeout >70s. Endpoint: ${endpoint}`;
    } else if (!errorDetail) {
      logStatus = "error";
      errorDetail = msg;
    }
    throw e;
  } finally {
    const execMs = Date.now() - startTime;
    // Save integration log (non-blocking)
    supabase
      .from("integration_logs")
      .insert({
        client_id: client.id,
        http_method: method,
        url,
        request_headers: JSON.stringify({ Authorization: `Bearer ${token.substring(0, 10)}...` }),
        request_body: body ? JSON.stringify(body) : null,
        http_status_code: httpStatus ?? null,
        response_body: responseBody ? responseBody.substring(0, 10000) : null,
        raw_response: responseBody ? responseBody.substring(0, 5000) : null,
        token: token.substring(0, 10),
        auth_prefix: "Bearer",
        status: logStatus,
        error_detail: errorDetail ?? null,
        service_name: extractServiceName(url),
        execution_time_ms: execMs,
      })
      .then(() => {})
      .catch(() => {});
  }
}

// ── action handlers ───────────────────────────────────────────────────────────

async function handleTestToken(
  supabase: ReturnType<typeof createClient>,
  client: Record<string, unknown>
): Promise<Response> {
  // Force refresh by clearing cache first
  await supabase
    .from("clients")
    .update({ cached_token: null, token_expires_at: null })
    .eq("id", client.id);
  try {
    await getToken(supabase, { ...client, cached_token: null, token_expires_at: null });
    return json({ success: true });
  } catch (e: unknown) {
    return json({ success: false, error: e instanceof Error ? e.message : "COMMUNICATION_FAILURE_TOKEN" });
  }
}

async function handleBatchConfig(client: Record<string, unknown>): Promise<Response> {
  return json({
    batchSize: client.batch_size ?? 10,
    batchDelaySeconds: client.batch_delay_seconds ?? 3,
    syncRules: client.sync_rules ?? null,
    clientName: client.name ?? null,
    primaryColor: client.primary_color ?? null,
  });
}

async function handleVerifySuppliers(
  supabase: ReturnType<typeof createClient>,
  client: Record<string, unknown>,
  suppliers: Array<{ providerExternalCode1: string; providerExternalCode2?: string }>
): Promise<Response> {
  const token = await getToken(supabase, client);

  const results: Array<{
    providerExternalCode1: string;
    providerExternalCode2: string;
    exists: boolean;
    error?: string;
  }> = [];

  try {
    const data = await callExternalApi(
      supabase,
      client,
      "/ApiManager/suppliers_v3/supplier_exists",
      "POST",
      {
        list_provider: suppliers.map((s) => ({
          provider_external_code_1: s.providerExternalCode1,
          provider_external_code_2: s.providerExternalCode2 || "",
          ProveedorCodigoExterno3: "",
        })),
      },
      token
    ) as Record<string, unknown>;

    const responseList = (data?.outlist_provider as unknown[]) || [];

    // Build a set of all codes that exist in the portal
    const existingCodes = new Set<string>();
    for (const item of responseList) {
      const i = item as Record<string, unknown>;
      if (i.provider_exists !== true) continue;
      const c1 = String(i.provider_external_code_1 || "").trim();
      const c2 = String(i.provider_external_code_2 || "").trim();
      if (c1) existingCodes.add(c1);
      if (c2) existingCodes.add(c2);
    }

    for (const s of suppliers) {
      const k1 = s.providerExternalCode1.trim();
      const k2 = (s.providerExternalCode2 || "").trim();
      results.push({
        providerExternalCode1: s.providerExternalCode1,
        providerExternalCode2: s.providerExternalCode2 || "",
        exists: existingCodes.has(k1) || (k2 !== "" && existingCodes.has(k2)),
      });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    for (const s of suppliers) {
      results.push({
        providerExternalCode1: s.providerExternalCode1,
        providerExternalCode2: s.providerExternalCode2 || "",
        exists: false,
        error: msg,
      });
    }
  }

  return json({
    results,
    summary: {
      total: results.length,
      exists: results.filter((r) => r.exists).length,
      notExists: results.filter((r) => !r.exists && !r.error).length,
      errors: results.filter((r) => !!r.error).length,
    },
  });
}

async function handleVerifyPurchaseOrders(
  supabase: ReturnType<typeof createClient>,
  client: Record<string, unknown>,
  orders: Array<{
    purchaseOrderId: string;
    providerExternalCode1: string;
    providerExternalCode2?: string;
    buyerCode?: string;
  }>,
  isLastBatch: boolean,
  globalSummary?: Record<string, number>
): Promise<Response> {
  const token = await getToken(supabase, client);
  const results: unknown[] = [];
  const OC_BATCH_SIZE = 40;

  // Group by buyer
  const byBuyer = new Map<string, typeof orders>();
  for (const order of orders) {
    const key = (order.buyerCode ?? "").trim();
    if (!byBuyer.has(key)) byBuyer.set(key, []);
    byBuyer.get(key)!.push(order);
  }

  for (const [buyerCode, buyerOrders] of Array.from(byBuyer.entries())) {
    for (let i = 0; i < buyerOrders.length; i += OC_BATCH_SIZE) {
      const subBatch = buyerOrders.slice(i, i + OC_BATCH_SIZE);
      try {
        const data = await callExternalApi(
          supabase,
          client,
          "/apimanager/purchase_order_v1/list",
          "POST",
          {
            buyer_external_code: buyerCode,
            purchase_order_number_array: subBatch.map((o) => o.purchaseOrderId.trim()),
          },
          token
        ) as Record<string, unknown>;

        const foundMap = new Map<string, Record<string, unknown>>();
        const sdtList = (data?.SDTOrdenesCompra as unknown[]) || [];
        for (const oc of sdtList) {
          const o = oc as Record<string, unknown>;
          if (o.purchase_order_number) {
            foundMap.set(String(o.purchase_order_number).trim(), o);
          }
        }

        for (const order of subBatch) {
          const oc = foundMap.get(order.purchaseOrderId.trim());
          if (oc) {
            results.push({
              purchaseOrderId: order.purchaseOrderId,
              providerExternalCode1: order.providerExternalCode1,
              providerExternalCode2: order.providerExternalCode2 || "",
              buyerCode: order.buyerCode,
              buyerName: oc.buyer_name || null,
              providerName: oc.provider_name || null,
              status: "found",
              syncStatus: "synchronized",
              documentDate: oc.document_date || null,
              synchronizationDate: oc.synchronization_date || null,
              synchronizationDate2: oc.synchronization_date2 || null,
              manualDateSynch: oc.manual_date_synch || null,
              deliveryStatus: oc.delivery_status || null,
              canceled: oc.canceled != null ? String(oc.canceled) : null,
              updated: oc.updated != null ? String(oc.updated) : null,
            });
          } else {
            results.push({
              purchaseOrderId: order.purchaseOrderId,
              providerExternalCode1: order.providerExternalCode1,
              providerExternalCode2: order.providerExternalCode2 || "",
              buyerCode: order.buyerCode,
              status: "not_found",
              syncStatus: null,
              error: null,
            });
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        for (const order of subBatch) {
          results.push({
            purchaseOrderId: order.purchaseOrderId,
            providerExternalCode1: order.providerExternalCode1,
            providerExternalCode2: order.providerExternalCode2 || "",
            buyerCode: order.buyerCode,
            status: "error",
            syncStatus: null,
            error: msg,
          });
        }
      }
    }
  }

  const typedResults = results as Array<Record<string, unknown>>;
  const batchSummary = {
    total: typedResults.length,
    found: typedResults.filter((r) => r.status === "found").length,
    not_found: typedResults.filter((r) => r.status === "not_found").length,
    supplier_not_exists: typedResults.filter((r) => r.status === "supplier_not_exists").length,
    errors: typedResults.filter((r) => r.status === "error").length,
  };

  // Save verification log on last batch
  if (isLastBatch) {
    const gs = globalSummary || batchSummary;
    await supabase.from("verification_logs").insert({
      client_id: client.id,
      total_records: (gs.total || 0) + batchSummary.total,
      synced: (gs.found || 0) + batchSummary.found,
      not_found: (gs.not_found || 0) + batchSummary.not_found,
      supplier_not_exists: (gs.supplier_not_exists || 0) + batchSummary.supplier_not_exists,
      errors: (gs.errors || 0) + batchSummary.errors,
      execution_time_ms: 0,
    });
  }

  // Normalize results
  const normalizedResults = typedResults.map((r) => ({
    purchaseOrderId: String(r.purchaseOrderId ?? ""),
    providerExternalCode1: String(r.providerExternalCode1 ?? ""),
    providerExternalCode2: String(r.providerExternalCode2 ?? ""),
    providerExternalCode3: String(r.providerExternalCode3 ?? ""),
    buyerCode: r.buyerCode != null ? String(r.buyerCode) : null,
    buyerName: r.buyerName != null ? String(r.buyerName) : null,
    providerName: r.providerName != null ? String(r.providerName) : null,
    status: String(r.status ?? "error"),
    syncStatus: r.syncStatus != null ? String(r.syncStatus) : null,
    documentDate: r.documentDate != null ? String(r.documentDate) : null,
    synchronizationDate: r.synchronizationDate != null ? String(r.synchronizationDate) : null,
    synchronizationDate2: r.synchronizationDate2 != null ? String(r.synchronizationDate2) : null,
    deliveryStatus: r.deliveryStatus != null ? String(r.deliveryStatus) : null,
    canceled: r.canceled != null ? String(r.canceled) : null,
    updated: r.updated != null ? String(r.updated) : null,
    error: r.error != null ? String(r.error) : null,
  }));

  return json({ results: normalizedResults, summary: batchSummary });
}

async function handleSynchronizeBatch(
  supabase: ReturnType<typeof createClient>,
  client: Record<string, unknown>,
  orders: Array<{ buyerExternalCode: string; purchaseOrderNumber: string; sendEmails?: boolean }>
): Promise<Response> {
  const token = await getToken(supabase, client);

  const results: Array<{
    purchaseOrderNumber: string;
    buyerExternalCode: string;
    success: boolean;
    message?: string | null;
    errorMessage?: string | null;
    error?: string | null;
    httpStatus?: number | null;
  }> = [];

  for (const order of orders) {
    try {
      const data = await callExternalApi(
        supabase,
        client,
        "/apimanager/purchase_order_v1/synchronize_purchase_order",
        "POST",
        {
          buyer_external_code: order.buyerExternalCode,
          purchase_order_number: order.purchaseOrderNumber,
          send_emails: order.sendEmails ?? true,
        },
        token
      ) as Record<string, unknown>;

      const seguimiento = data?.SDTSeguimineto as Record<string, number> | undefined;

      if (!seguimiento) {
        results.push({
          purchaseOrderNumber: order.purchaseOrderNumber,
          buyerExternalCode: order.buyerExternalCode,
          success: false,
          error: "Respuesta inválida del servidor (sin SDTSeguimineto)",
        });
        continue;
      }

      const isSuccess = (seguimiento.Actualizadas > 0 || seguimiento.Creadas > 0);
      const hasError = (
        seguimiento.ProveedorNoExiste > 0 ||
        seguimiento.CompradorNoExiste > 0 ||
        seguimiento.TotalOCs === 0 ||
        seguimiento.AnuladasNoRegistradas > 0 ||
        seguimiento.SinProveedor > 0
      );

      let errorMessage: string | null = null;
      const msg = data.message as string | undefined;
      if (msg?.includes("Not found Buyer")) {
        errorMessage = "No existe la empresa compradora, verifique que el número contenga incluso los ceros a la izquierda";
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

      results.push({
        purchaseOrderNumber: order.purchaseOrderNumber,
        buyerExternalCode: order.buyerExternalCode,
        success: isSuccess && !hasError,
        message: msg || null,
        errorMessage,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        purchaseOrderNumber: order.purchaseOrderNumber,
        buyerExternalCode: order.buyerExternalCode,
        success: false,
        error: msg,
        errorMessage: msg,
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;

  return json({
    results,
    summary: { total: results.length, success: successCount, failed: results.length - successCount },
  });
}

// ── main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { action, clientKey, ...payload } = body as Record<string, unknown>;

    if (!clientKey) return err("clientKey is required");

    // Resolve client from DB
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("*")
      .eq("client_key", clientKey)
      .single();

    if (clientErr || !client) return err("Client not found", 404);
    if (!client.is_active) return err("Client is inactive", 403);

    switch (action) {
      case "test-token":
        return await handleTestToken(supabase, client);
      case "batch-config":
        return await handleBatchConfig(client);
      case "verify-suppliers":
        return await handleVerifySuppliers(supabase, client, payload.suppliers as never);
      case "verify-purchase-orders":
        return await handleVerifyPurchaseOrders(
          supabase,
          client,
          payload.orders as never,
          !!(payload.isLastBatch),
          payload.globalSummary as Record<string, number> | undefined
        );
      case "synchronize-batch":
        return await handleSynchronizeBatch(supabase, client, payload.orders as never);
      default:
        return err(`Unknown action: ${String(action)}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[egixia-api]", msg);
    return err(msg, 500);
  }
});
