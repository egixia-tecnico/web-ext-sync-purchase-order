/**
 * Script: reactivate-clients.mjs
 * Reactiva todos los clientes que quedaron inactivos por el bug de activación exclusiva.
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

// Ver estado actual
const [rows] = await conn.execute("SELECT id, name, isActive FROM clients");
console.log("\n📋 Clientes actuales:");
for (const row of rows) {
  console.log(`  ID ${row.id}: ${row.name} → isActive=${row.isActive}`);
}

// Reactivar todos los inactivos
const [result] = await conn.execute(
  "UPDATE clients SET isActive = 1 WHERE isActive = 0"
);
console.log(`\n✅ Clientes reactivados: ${result.affectedRows}`);

// Verificar resultado
const [after] = await conn.execute("SELECT id, name, isActive FROM clients");
console.log("\n📋 Estado final:");
for (const row of after) {
  console.log(`  ID ${row.id}: ${row.name} → isActive=${row.isActive}`);
}

await conn.end();
