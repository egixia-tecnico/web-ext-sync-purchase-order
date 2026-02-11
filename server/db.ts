import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, apiConfigs, InsertApiConfig, verificationLogs } from "../drizzle/schema";
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

  // Deactivate all existing defaults
  await db.update(apiConfigs).set({ isDefault: false }).where(eq(apiConfigs.isDefault, true));

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
