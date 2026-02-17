import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, apiConfigs, InsertApiConfig, verificationLogs, clients, InsertClient, Client } from "../drizzle/schema";
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

// ===== API Config functions =====

export async function getDefaultApiConfig() {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(apiConfigs).where(eq(apiConfigs.isDefault, true)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertApiConfig(config: {
  baseUrl: string;
  userName: string;
  password: string;
  clientId: string;
  clientSecret: string;
  configName?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if a default config already exists
  const existing = await db.select().from(apiConfigs).where(eq(apiConfigs.isDefault, true)).limit(1);

  if (existing.length > 0) {
    // Update existing default config
    await db.update(apiConfigs).set({
      baseUrl: config.baseUrl,
      userName: config.userName,
      password: config.password,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      configName: config.configName || "default",
    }).where(eq(apiConfigs.id, existing[0].id));
  } else {
    // Insert new default config
    await db.insert(apiConfigs).values({
      configName: config.configName || "default",
      baseUrl: config.baseUrl,
      userName: config.userName,
      password: config.password,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      isDefault: true,
    });
  }
}

export async function saveVerificationLog(log: {
  userId?: number;
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

export async function getVerificationHistory(limit: number = 20) {
  const db = await getDb();
  if (!db) return [];

  const logs = await db
    .select()
    .from(verificationLogs)
    .orderBy(desc(verificationLogs.createdAt))
    .limit(limit);

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

export async function getActiveClient() {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(clients).where(eq(clients.isActive, true)).limit(1);
  return result[0] || null;
}

export async function createClient(data: InsertClient) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // If this client is set as active, deactivate all others first
  if (data.isActive) {
    await db.update(clients).set({ isActive: false });
  }

  const result = await db.insert(clients).values(data);
  return result;
}

export async function updateClient(id: number, data: Partial<InsertClient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // If setting this client as active, deactivate all others first
  if (data.isActive === true) {
    await db.update(clients).set({ isActive: false });
  }

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

  // Deactivate all clients first
  await db.update(clients).set({ isActive: false });
  
  // Activate the selected client
  await db.update(clients).set({ isActive: true }).where(eq(clients.id, id));
}
