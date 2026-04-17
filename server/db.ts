import { eq, desc, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, verificationLogs, clients, InsertClient, Client, magicLinks, InsertMagicLink, integrationLogs } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ===== API Config functions removed - all configuration now in clients table =====

export async function saveVerificationLog(log: {
  userId?: number;
  clientId?: number;
  totalRecords: number;
  synced: number;
  notFound: number;
  supplierNotExists: number;
  errors: number;
  executionTimeMs: number;
}) {
  const db = await getDb();
  if (!db) return;

  await db.insert(verificationLogs).values(log);
}

export async function getVerificationHistory(clientId?: number, limit: number = 20) {
  const db = await getDb();
  if (!db) return [];

  let query = db
    .select()
    .from(verificationLogs)
    .orderBy(desc(verificationLogs.createdAt));

  // Filter by clientId if provided
  if (clientId) {
    query = query.where(eq(verificationLogs.clientId, clientId)) as any;
  }

  const logs = await query.limit(limit);

  return logs;
}

// ===== Clients management =====

export async function getClients() {
  const db = await getDb();
  if (!db) return [];

  const allClients = await db.select().from(clients).orderBy(desc(clients.createdAt));
  return allClients;
}

export async function getClientById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return result[0] || null;
}

export async function getClientByKey(clientKey: string) {
  const db = await getDb();
  if (!db) return null;

  // Case-insensitive search using LOWER()
  const result = await db
    .select()
    .from(clients)
    .where(sql`LOWER(${clients.clientKey}) = LOWER(${clientKey})`)
    .limit(1);
  return result[0] || null;
}

export async function getActiveClient() {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(clients).where(eq(clients.isActive, true)).limit(1);
  return result[0] || null;
}

export async function createClient(data: InsertClient) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Multiple clients can be active simultaneously - no exclusivity enforced
  const result = await db.insert(clients).values(data);
  return result;
}

export async function updateClient(id: number, data: Partial<InsertClient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Multiple clients can be active simultaneously - just update this client
  await db.update(clients).set(data).where(eq(clients.id, id));
}

export async function deleteClient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(clients).where(eq(clients.id, id));
}

export async function setActiveClient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Only activate the selected client - other clients keep their current state
  await db.update(clients).set({ isActive: true }).where(eq(clients.id, id));
}

// ==================== Magic Links ====================

export async function createMagicLink(data: InsertMagicLink) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(magicLinks).values(data);
  return true;
}

export async function getMagicLinkByToken(token: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(magicLinks).where(eq(magicLinks.token, token)).limit(1);
  return result[0] || null;
}

export async function markMagicLinkAsUsed(token: string) {
  const db = await getDb();
  if (!db) return false;

  await db.update(magicLinks).set({ used: true }).where(eq(magicLinks.token, token));
  return true;
}

// ==================== Integration Logs ====================

export async function saveIntegrationLog(data: {
  clientId: number;
  url: string;
  requestBody?: string;
  responseBody?: string;
  token?: string;
  authPrefix?: string;
  status: string;
}) {
  const db = await getDb();
  if (!db) return false;

  try {
    // Insert new log
    await db.insert(integrationLogs).values({
      clientId: data.clientId,
      url: data.url,
      requestBody: data.requestBody || null,
      responseBody: data.responseBody || null,
      token: data.token ? data.token.substring(0, 10) + "..." : null, // Partial token
      authPrefix: data.authPrefix || "Bearer",
      status: data.status,
    });

    // Clean old logs - keep only last 10 per integration type (30 total max)
    await cleanOldIntegrationLogs(data.clientId);
    
    return true;
  } catch (error) {
    console.error("[Database] Failed to save integration log:", error);
    return false;
  }
}

export async function getIntegrationLogs(clientId: number) {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(integrationLogs)
    .where(eq(integrationLogs.clientId, clientId))
    .orderBy(desc(integrationLogs.createdAt))
    .limit(20);

  return result;
}

export async function deleteIntegrationLogsByClientKey(clientKey: string) {
  const db = await getDb();
  if (!db) return false;

  try {
    // Get client by key
    const client = await getClientByKey(clientKey);
    if (!client) {
      console.warn(`[Database] Client not found for key: ${clientKey}`);
      return false;
    }

    // Delete all logs for this client
    await db.delete(integrationLogs).where(eq(integrationLogs.clientId, client.id));
    console.log(`[Database] Deleted all integration logs for client: ${client.name}`);
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete integration logs:", error);
    return false;
  }
}

async function cleanOldIntegrationLogs(clientId: number) {
  const db = await getDb();
  if (!db) return;

  // Get all logs for this client, ordered by date desc
  const allLogs = await db
    .select({ id: integrationLogs.id, url: integrationLogs.url, createdAt: integrationLogs.createdAt })
    .from(integrationLogs)
    .where(eq(integrationLogs.clientId, clientId))
    .orderBy(desc(integrationLogs.createdAt));

  // Group logs by integration type (extract service name from URL)
  const logsByType: Record<string, typeof allLogs> = {};
  for (const log of allLogs) {
    const serviceName = extractServiceName(log.url);
    if (!logsByType[serviceName]) {
      logsByType[serviceName] = [];
    }
    logsByType[serviceName].push(log);
  }

  // Keep only last 10 per type
  const idsToDelete: number[] = [];
  for (const [serviceName, logs] of Object.entries(logsByType)) {
    if (logs.length > 10) {
      const toDelete = logs.slice(10).map(log => log.id);
      idsToDelete.push(...toDelete);
    }
  }

  if (idsToDelete.length > 0) {
    await db.delete(integrationLogs).where(inArray(integrationLogs.id, idsToDelete));
  }
}

function extractServiceName(url: string): string {
  // Extract service name from URL
  // Examples:
  // /apimanager/purchase_order_v1/list -> purchase_order_v1_list
  // /ApiManager/suppliers_v3/supplier_exists -> suppliers_v3_supplier_exists
  // /apimanager/purchase_order_v1/synchronize_purchase_order -> purchase_order_v1_synchronize
  const match = url.match(/\/(apimanager|ApiManager)\/([^\/]+)\/([^\/\?]+)/);
  if (match) {
    return `${match[2]}_${match[3]}`;
  }
  return "unknown";
}
