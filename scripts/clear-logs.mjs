/**
 * Script: clear-logs.mjs
 * Limpia las tablas verification_logs e integration_logs.
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not found in environment");
  process.exit(1);
}

const conn = await createConnection(DATABASE_URL);

// Contar registros antes de borrar
const [[{ vCount }]] = await conn.execute("SELECT COUNT(*) as vCount FROM verification_logs");
const [[{ iCount }]] = await conn.execute("SELECT COUNT(*) as iCount FROM integration_logs");

console.log(`\n📋 Registros actuales:`);
console.log(`  verification_logs: ${vCount}`);
console.log(`  integration_logs:  ${iCount}`);

// Limpiar tablas
await conn.execute("DELETE FROM verification_logs");
await conn.execute("DELETE FROM integration_logs");

console.log(`\n✅ Tablas limpiadas:`);
console.log(`  verification_logs: ${vCount} registros eliminados`);
console.log(`  integration_logs:  ${iCount} registros eliminados`);

await conn.end();
