// API layer — replaces all tRPC calls.
// DB operations use Supabase directly; Egixia portal calls go through the Edge Function.

import { supabase, callEdge } from "./supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClientRow {
  id: number;
  client_key: string;
  name: string;
  base_url: string;
  user_name: string;
  password: string;
  client_id: string;
  client_secret: string;
  primary_color: string;
  sync_rules: string | null;
  batch_size: number;
  batch_delay_seconds: number;
  is_active: boolean;
  created_at: string;
}

// camelCase view used by existing components
export interface ClientData {
  id: number;
  clientKey: string;
  name: string;
  baseUrl: string;
  userName: string;
  password: string;
  clientId: string;
  clientSecret: string;
  primaryColor: string;
  syncRules: string | null;
  batchSize: number;
  batchDelaySeconds: number;
  isActive: boolean;
  createdAt: string;
}

function toClientData(r: ClientRow): ClientData {
  return {
    id: r.id,
    clientKey: r.client_key,
    name: r.name,
    baseUrl: r.base_url,
    userName: r.user_name,
    password: r.password,
    clientId: r.client_id,
    clientSecret: r.client_secret,
    primaryColor: r.primary_color,
    syncRules: r.sync_rules,
    batchSize: r.batch_size ?? 10,
    batchDelaySeconds: r.batch_delay_seconds ?? 3,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function checkAdminSession(): Promise<{ isAdmin: boolean; email: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.email) return { isAdmin: false, email: null };
  const isAdmin = session.user.email.endsWith("@egixia.com");
  return { isAdmin, email: isAdmin ? session.user.email : null };
}

export async function sendMagicLink(email: string, redirectTo: string): Promise<void> {
  if (!email.endsWith("@egixia.com")) {
    throw new Error("Solo se permiten correos @egixia.com");
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(error.message);
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

// ── Clients CRUD ──────────────────────────────────────────────────────────────

export async function listClients(): Promise<ClientData[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as ClientRow[]).map(toClientData);
}

export async function getClientByKey(clientKey: string): Promise<ClientData | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("client_key", clientKey)
    .single();
  if (error) return null;
  return toClientData(data as ClientRow);
}

export async function getClientById(id: number): Promise<ClientData | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return toClientData(data as ClientRow);
}

export async function createClient(input: Omit<ClientData, "id" | "createdAt">): Promise<ClientData> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      client_key: input.clientKey,
      name: input.name,
      base_url: input.baseUrl,
      user_name: input.userName,
      password: input.password,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      primary_color: input.primaryColor,
      sync_rules: input.syncRules,
      batch_size: input.batchSize,
      batch_delay_seconds: input.batchDelaySeconds,
      is_active: input.isActive,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toClientData(data as ClientRow);
}

export async function updateClient(id: number, input: Partial<Omit<ClientData, "id" | "createdAt">>): Promise<ClientData> {
  const patch: Record<string, unknown> = {};
  if (input.clientKey    !== undefined) patch.client_key         = input.clientKey;
  if (input.name         !== undefined) patch.name               = input.name;
  if (input.baseUrl      !== undefined) patch.base_url           = input.baseUrl;
  if (input.userName     !== undefined) patch.user_name          = input.userName;
  if (input.password     !== undefined) patch.password           = input.password;
  if (input.clientId     !== undefined) patch.client_id          = input.clientId;
  if (input.clientSecret !== undefined) patch.client_secret      = input.clientSecret;
  if (input.primaryColor !== undefined) patch.primary_color      = input.primaryColor;
  if (input.syncRules    !== undefined) patch.sync_rules         = input.syncRules;
  if (input.batchSize    !== undefined) patch.batch_size         = input.batchSize;
  if (input.batchDelaySeconds !== undefined) patch.batch_delay_seconds = input.batchDelaySeconds;
  if (input.isActive     !== undefined) patch.is_active          = input.isActive;

  const { data, error } = await supabase
    .from("clients")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toClientData(data as ClientRow);
}

export async function deleteClientById(id: number): Promise<void> {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setActiveClient(id: number): Promise<void> {
  // Deactivate all, then activate the selected one
  const { error: e1 } = await supabase.from("clients").update({ is_active: false }).neq("id", -1);
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await supabase.from("clients").update({ is_active: true }).eq("id", id);
  if (e2) throw new Error(e2.message);
}

export async function testClientConnection(clientKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await callEdge<{ success: boolean; error?: string }>("test-token", clientKey);
    return result;
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Egixia (portal API via Edge Function) ────────────────────────────────────

export async function testToken(clientKey: string): Promise<{ success: boolean; error?: string }> {
  return callEdge("test-token", clientKey);
}

export async function getBatchConfig(clientKey: string) {
  return callEdge<{
    batchSize: number;
    batchDelaySeconds: number;
    syncRules: string | null;
    clientName: string | null;
    primaryColor: string | null;
  }>("batch-config", clientKey);
}

export async function verifySuppliersBatch(
  clientKey: string,
  suppliers: Array<{ providerExternalCode1: string; providerExternalCode2?: string }>
) {
  return callEdge<{
    results: Array<{
      providerExternalCode1: string;
      providerExternalCode2: string;
      exists: boolean;
      error?: string;
    }>;
    summary: { total: number; exists: number; notExists: number; errors: number };
  }>("verify-suppliers", clientKey, { suppliers });
}

export async function verifyPurchaseOrders(
  clientKey: string,
  orders: Array<{
    purchaseOrderId: string;
    providerExternalCode1: string;
    providerExternalCode2?: string;
    buyerCode?: string;
  }>,
  isLastBatch?: boolean,
  globalSummary?: Record<string, number>
) {
  return callEdge<{
    results: Array<Record<string, unknown>>;
    summary: { total: number; found: number; not_found: number; supplier_not_exists: number; errors: number };
  }>("verify-purchase-orders", clientKey, { orders, isLastBatch, globalSummary });
}

export async function synchronizeBatch(
  clientKey: string,
  orders: Array<{ buyerExternalCode: string; purchaseOrderNumber: string; sendEmails?: boolean }>
) {
  return callEdge<{
    results: Array<{
      purchaseOrderNumber: string;
      buyerExternalCode: string;
      success: boolean;
      message?: string | null;
      errorMessage?: string | null;
      error?: string | null;
      httpStatus?: number | null;
    }>;
    summary: { total: number; success: number; failed: number };
  }>("synchronize-batch", clientKey, { orders });
}

// ── Verification history ──────────────────────────────────────────────────────

export async function getVerificationHistory(clientKey: string) {
  // Get client id first
  const client = await getClientByKey(clientKey);
  if (!client) return [];

  const { data, error } = await supabase
    .from("verification_logs")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data || []) as Array<{
    id: number;
    total_records: number;
    synced: number;
    not_found: number;
    supplier_not_exists: number;
    errors: number;
    execution_time_ms: number | null;
    created_at: string;
  }>;
}

// ── Integration logs ──────────────────────────────────────────────────────────

export async function getIntegrationLogs(
  clientKey: string,
  opts: { limit?: number; offset?: number; status?: string }
) {
  const client = await getClientByKey(clientKey);
  if (!client) return { logs: [], total: 0 };

  let query = supabase
    .from("integration_logs")
    .select("*", { count: "exact" })
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  if (opts.status && opts.status !== "all") {
    query = query.eq("status", opts.status);
  }
  if (opts.offset) query = query.range(opts.offset, opts.offset + (opts.limit ?? 25) - 1);
  else query = query.limit(opts.limit ?? 25);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { logs: data || [], total: count ?? 0 };
}

export async function clearIntegrationLogs(clientKey: string): Promise<void> {
  const client = await getClientByKey(clientKey);
  if (!client) return;
  const { error } = await supabase
    .from("integration_logs")
    .delete()
    .eq("client_id", client.id);
  if (error) throw new Error(error.message);
}

export async function deleteLogsBeforeDate(clientKey: string, beforeDate: Date): Promise<void> {
  const client = await getClientByKey(clientKey);
  if (!client) return;
  await supabase
    .from("integration_logs")
    .delete()
    .eq("client_id", client.id)
    .lt("created_at", beforeDate.toISOString());
}
