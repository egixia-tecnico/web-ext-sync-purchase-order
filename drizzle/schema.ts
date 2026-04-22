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
  batchSize: int("batchSize").notNull().default(10), // number of concurrent requests per batch
  batchDelaySeconds: int("batchDelaySeconds").notNull().default(3), // seconds to wait between batches
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
  returnPath: varchar("returnPath", { length: 512 }), // optional path to redirect after authentication
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MagicLink = typeof magicLinks.$inferSelect;
export type InsertMagicLink = typeof magicLinks.$inferInsert;

/**
 * Integration logs - stores raw API call data for full backend traceability
 * Includes: method, URL, headers, request body, raw response, HTTP status, execution time
 */
export const integrationLogs = mysqlTable("integration_logs", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(), // foreign key to clients table
  httpMethod: varchar("httpMethod", { length: 10 }).notNull().default("GET"), // GET, POST, etc.
  url: varchar("url", { length: 1024 }).notNull(),
  requestHeaders: text("requestHeaders"), // JSON string of headers sent (token masked)
  requestBody: text("requestBody"), // Raw request body/params as sent to API
  httpStatusCode: int("httpStatusCode"), // HTTP status code returned (200, 401, 503, etc.)
  responseBody: text("responseBody"), // Raw response body as received from API
  rawResponse: text("rawResponse"), // Full raw response (including HTML errors, truncated to 5000 chars)
  token: varchar("token", { length: 50 }), // Partial token (first 10 chars)
  authPrefix: varchar("authPrefix", { length: 20 }).default("Bearer"), // e.g., "Bearer"
  status: varchar("status", { length: 20 }).notNull(), // "success", "error", "timeout"
  errorDetail: text("errorDetail"), // Human-readable error message when status is "error" or "timeout"
  serviceName: varchar("serviceName", { length: 100 }), // Extracted service name (e.g., "purchase_order_v1_list")
  executionTimeMs: int("executionTimeMs"), // Time in ms from request start to response
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type IntegrationLog = typeof integrationLogs.$inferSelect;
export type InsertIntegrationLog = typeof integrationLogs.$inferInsert;
