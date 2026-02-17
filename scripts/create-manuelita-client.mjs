/**
 * Script para crear cliente Manuelita con las credenciales proporcionadas
 * Run: node scripts/create-manuelita-client.mjs
 */
import { createClient } from "../server/db.js";
import { encrypt } from "../server/encryption.js";

async function main() {
  console.log("Creating Manuelita client...");

  const clientData = {
    name: "Manuelita",
    clientKey: "a4559cf615a14a20acbd8d6eef9d315e",
    baseUrl: "https://egixia.net/ProveedoresManuelita/",
    userName: "admin_test",
    password: encrypt("9#j)V-lFdO(R"),
    clientId: encrypt("a4559cf615a14a20acb38b6eef9d315e"),
    clientSecret: encrypt("823e412901664bcfa1ab2168b69ddbeb"),
    primaryColor: "#10b981",
    isActive: true,
    syncRules: "Reglas de sincronización de Manuelita:\n1. Solo sincronizar OCs con estado 'Aprobado'\n2. Validar que el proveedor exista antes de sincronizar\n3. Si el buyer code es '0230', usar external_code_2 para validación de proveedor\n4. Para el resto de buyer codes, usar external_code_1",
  };

  try {
    const result = await createClient(clientData);
    console.log("✅ Cliente Manuelita creado exitosamente:", result);
    console.log("\nAhora puedes acceder con:");
    console.log(`https://3000-i1izdkm80ysy110j80w68-b19bc003.us2.manus.computer/?clientKey=a4559cf615a14a20acbd8d6eef9d315e`);
  } catch (error) {
    console.error("❌ Error creando cliente:", error.message);
  }
}

main();
