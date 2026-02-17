import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * API configuration for Egixia integration.
 * Stores credentials and base URL per tenant/config.
 * Only one active config at a time (isDefault=true).
 */
export const apiConfigs = mysqlTable("api_configs", {
  id: int("id").autoincrement().primaryKey(),
  configName: varchar("configName", { length: 255 }).notNull().default("default"),
  baseUrl: varchar("baseUrl", { length: 512 }).notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  password: varchar("password", { length: 512 }).notNull(),
  clientId: varchar("clientId", { length: 255 }).notNull(),
  clientSecret: varchar("clientSecret", { length: 512 }).notNull(),
  isDefault: boolean("isDefault").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiConfig = typeof apiConfigs.$inferSelect;
export type InsertApiConfig = typeof apiConfigs.$inferInsert;

/**
 * Verification log - stores history of batch verifications
 */
export const verificationLogs = mysqlTable("verification_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  totalRecords: int("totalRecords").notNull().default(0),
  synced: int("synced").notNull().default(0),
  notFound: int("notFound").notNull().default(0),
  supplierNotExists: int("supplierNotExists").notNull().default(0),
  errors: int("errors").notNull().default(0),
  executionTimeMs: int("executionTimeMs").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VerificationLog = typeof verificationLogs.$inferSelect;

/**
 * Clients table - stores multi-tenant client configurations
 * Sensitive fields (password, clientId, clientSecret) are encrypted
 */
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  baseUrl: varchar("baseUrl", { length: 512 }).notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  password: text("password").notNull(), // encrypted
  clientId: text("clientId").notNull(), // encrypted
  clientSecret: text("clientSecret").notNull(), // encrypted
  primaryColor: varchar("primaryColor", { length: 7 }).notNull().default("#10b981"), // hex color
  isActive: boolean("isActive").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;
