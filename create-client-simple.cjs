/**
 * Script simple para crear cliente Manuelita
 * Run: node create-client-simple.js
 */
const crypto = require('crypto');

// Encriptación AES-256-CBC
const ENCRYPTION_KEY = process.env.JWT_SECRET || 'default-secret-key-32-chars!!!';
const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

const password = encrypt("9#j)V-lFdO(R");
const clientId = encrypt("a4559cf615a14a20acb38b6eef9d315e");
const clientSecret = encrypt("823e412901664bcfa1ab2168b69ddbeb");

console.log("Encrypted values:");
console.log("password:", password);
console.log("clientId:", clientId);
console.log("clientSecret:", clientSecret);

console.log("\n\nSQL to insert:");
console.log(`
INSERT INTO clients (name, clientKey, baseUrl, userName, password, clientId, clientSecret, primaryColor, isActive, syncRules, createdAt)
VALUES (
  'Manuelita',
  'a4559cf615a14a20acbd8d6eef9d315e',
  'https://egixia.net/ProveedoresManuelita/',
  'admin_test',
  '${password}',
  '${clientId}',
  '${clientSecret}',
  '#10b981',
  1,
  'Reglas de sincronización de Manuelita:\\n1. Solo sincronizar OCs con estado Aprobado\\n2. Validar que el proveedor exista antes de sincronizar\\n3. Si el buyer code es 0230, usar external_code_2 para validación de proveedor\\n4. Para el resto de buyer codes, usar external_code_1',
  NOW()
);
`);
