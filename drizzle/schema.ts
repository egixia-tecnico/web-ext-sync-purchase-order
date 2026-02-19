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
 * Verification log - stores history of batch verifications
 */
export const verificationLogs = mysqlTable("verification_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  clientId: int("clientId"), // foreign key to clients table
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
 * Credentials are stored in plain text (not encrypted)
 */
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  clientKey: varchar("clientKey", { length: 64 }).notNull().unique(), // unique identifier for URL-based access
  name: varchar("name", { length: 255 }).notNull(),
  baseUrl: varchar("baseUrl", { length: 512 }).notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  password: varchar("password", { length: 512 }).notNull(), // plain text
  clientId: varchar("clientId", { length: 255 }).notNull(), // plain text
  clientSecret: varchar("clientSecret", { length: 512 }).notNull(), // plain text
  primaryColor: varchar("primaryColor", { length: 7 }).notNull().default("#10b981"), // hex color
  syncRules: text("syncRules"), // business rules for synchronization (optional)
  isActive: boolean("isActive").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

/**
 * Magic links table - stores temporary authentication tokens for admin access
 * Used for passwordless login via email for @egixia.com administrators
 */
export const magicLinks = mysqlTable("magic_links", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MagicLink = typeof magicLinks.$inferSelect;
export type InsertMagicLink = typeof magicLinks.$inferInsert;
