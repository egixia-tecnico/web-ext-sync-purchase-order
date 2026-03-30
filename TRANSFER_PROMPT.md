# Prompt de Transferencia - Egixia OC Sync Batch Processing

## Contexto del Proyecto

Proyecto: **Egixia OC Sync - Verificación y Sincronización de Órdenes de Compra**

Stack: React 19 + Tailwind 4 + Express 4 + tRPC 11 + Manus Auth + MySQL/TiDB

Ubicación: `/home/ubuntu/egixia-oc-sync`

## Implementación Completada: Procesamiento por Lotes (Batch Processing)

### Objetivo
Permitir que usuarios dividan operaciones de verificación y sincronización de órdenes de compra en lotes configurables, con delays entre lotes para no sobrecargar el servidor de Egixia.

**Ejemplo de uso:** Si un usuario selecciona 50 OC, en lugar de sincronizar las 50 en línea, el sistema divide en lotes de 10 y espera 3 segundos entre cada lote.

### Cambios Implementados

#### 1. Base de Datos (Schema)
- **Campo `batch_size`** (INTEGER, default 10): Cantidad de peticiones por lote
  - Validación: mínimo 1, máximo 100
- **Campo `batch_delay_seconds`** (INTEGER, default 3): Segundos de espera entre lotes
  - Validación: mínimo 1, máximo 60
- Tabla: `egixiaClients`
- Migración ya ejecutada con `pnpm db:push`

#### 2. Backend (server/routers.ts)

##### Función Helper: `checkSupplierExists()`
```typescript
/**
 * Verifica si un proveedor existe en el portal de Egixia
 * Retorna: { status: "found" | "not_found" | "supplier_not_exists" | "error", ... }
 */
async function checkSupplierExists(
  order: { purchaseOrderId: string; providerExternalCode1: string; ... },
  clientKey?: string
)
```

##### Endpoint: `egixia.verifyPurchaseOrders` (Existente, Modificado)
- **Entrada:** Array de órdenes a verificar
- **Procesamiento:** 
  - Obtiene `batch_size` y `batch_delay_seconds` del cliente
  - Divide las OC en lotes
  - Procesa cada lote secuencialmente
  - Espera `batch_delay_seconds` entre lotes
  - Verifica proveedores usando `checkSupplierExists()`
- **Salida:** 
  ```typescript
  {
    results: Array<{
      purchaseOrderId: string;
      status: "found" | "not_found" | "supplier_not_exists" | "error";
      error?: string;
      syncStatus?: string;
    }>;
    summary: { found: number; not_found: number; supplier_not_exists: number; errors: number };
    clientInfo?: { syncRules: string };
    batchInfo: { batchSize: number; batchDelaySeconds: number; totalBatches: number };
  }
  ```

##### Endpoint: `egixia.synchronizeBatch` (NUEVO)
- **Entrada:** 
  ```typescript
  {
    orders: Array<{
      buyerExternalCode: string;
      purchaseOrderNumber: string;
      sendEmails?: boolean;
    }>;
    clientKey?: string;
  }
  ```
- **Procesamiento:**
  - Obtiene `batch_size` y `batch_delay_seconds` del cliente
  - Divide las OC en lotes
  - Procesa cada lote secuencialmente (una OC por una)
  - Espera `batch_delay_seconds` entre lotes
  - Llama a `/apimanager/purchase_order_v1/synchronize_purchase_order` por cada OC
- **Salida:**
  ```typescript
  {
    results: Array<{
      purchaseOrderNumber: string;
      buyerExternalCode: string;
      success: boolean;
      message?: string | null;
      errorMessage?: string | null;
      error?: string | null;
      data?: any;
    }>;
    summary: { total: number; success: number; failed: number };
    batchInfo: { batchSize: number; batchDelaySeconds: number; totalBatches: number };
  }
  ```

##### Función Helper: `getClientCredentials(clientKey?: string)`
- Retorna: `{ batchSize: number; batchDelaySeconds: number; ... }`
- Usa defaults (10, 3) si no están configurados

##### Endpoint: `clients.list` (Modificado)
- Ahora retorna `batchSize` y `batchDelaySeconds` para cada cliente

##### Endpoint: `clients.getById` (Sin cambios, pero ya incluye batch fields)
- Retorna `batchSize` y `batchDelaySeconds`

#### 3. Frontend (client/src)

##### Hook: `useOCVerification()` (Reescrito)
- **`verifyBatch(recordsToVerify?)`:**
  - Llama a `trpc.egixia.verifyPurchaseOrders`
  - Muestra toast con info de lotes: "5 lotes de 10"
  - Actualiza estado de OC con resultado de verificación
  
- **`synchronizeBatch(recordsToSync?)`:**
  - Llama a `trpc.egixia.synchronizeBatch` (una sola llamada, backend maneja batching)
  - Muestra toast con info de lotes: "5 lotes de 10"
  - Después de sincronizar, re-verifica automáticamente los OC sincronizadas
  - Retorna: `{ success: number; failed: number; skipped: number }`

##### Página: `ClientsManagement.tsx` (Modificada)
- Agregada columna "Lotes" en tabla de clientes
- Muestra: "X peticiones" y "Y segundos espera"
- Ejemplo: "10 peticiones" y "3s espera"

##### Formulario: `ClientDialog.tsx` (Sin cambios necesarios)
- Ya incluye campos `batchSize` y `batchDelaySeconds`
- Validación: 1-100 para batch_size, 1-60 para batch_delay_seconds
- Defaults: 10 y 3

### Tests

#### Archivo: `server/batch.test.ts` (NUEVO)
5 tests nuevos:
1. `should create a client with batch configuration` - Verifica creación con valores custom
2. `should create a client with default batch values when not specified` - Verifica defaults
3. `should return batch fields in clients.list` - Verifica que list() retorna batch fields
4. `should return batch fields in clients.getById` - Verifica que getById() retorna batch fields
5. `should update batch configuration` - Verifica actualización de valores batch

**Estado:** 24 tests pasando (19 anteriores + 5 nuevos)

Ejecutar: `pnpm test`

### Flujo de Uso

1. **Admin configura cliente:**
   - Abre ClientsManagement
   - Crea o edita cliente
   - Define `batchSize` (ej: 10) y `batchDelaySeconds` (ej: 3)

2. **Usuario carga OC:**
   - Sube archivo Excel/CSV
   - Selecciona OC a verificar/sincronizar

3. **Usuario verifica OC:**
   - Click en "Verificar"
   - Backend divide en lotes de 10
   - Backend espera 3s entre lotes
   - Toast muestra: "Verificación completada (5 lotes de 10): 40 sincronizadas, 5 no encontradas..."

4. **Usuario sincroniza OC:**
   - Click en "Sincronizar"
   - Backend divide en lotes de 10
   - Backend espera 3s entre lotes
   - Toast muestra: "40 de 45 órdenes sincronizadas correctamente (5 lotes de 10)"

### Logging

El backend registra:
- `[Egixia] Batch verify: 50 orders, batchSize=10, delay=3s`
- `[Egixia] Processing verify batch 1/5 (10 orders)`
- `[Egixia] Waiting 3s before next verify batch...`
- `[Egixia] Batch sync: 50 orders, batchSize=10, delay=3s`
- `[Egixia] Processing sync batch 1/5 (10 orders)`
- `[Egixia] Waiting 3s before next sync batch...`

### Archivos Modificados

**Backend:**
- `server/routers.ts` - Agregadas funciones helper y endpoints batch

**Frontend:**
- `client/src/hooks/useOCVerification.ts` - Reescrito para usar synchronizeBatch
- `client/src/pages/ClientsManagement.tsx` - Agregada columna "Lotes"

**Tests:**
- `server/batch.test.ts` - Nuevo archivo con 5 tests

### Próximas Mejoras Sugeridas

1. **Barra de progreso en tiempo real:**
   - Mostrar "Lote 2 de 5" durante procesamiento
   - Requiere streaming o polling del backend
   - Mejoraría UX durante lotes largos

2. **Cancelación de procesamiento:**
   - Permitir cancelar a mitad de ejecución
   - Guardar estado parcial
   - Mostrar "Cancelado: 25 de 50 procesadas"

3. **Log de auditoría:**
   - Registrar en DB cada ejecución de batch
   - Campos: fecha, cliente, cantidad, lotes, tiempo total, éxitos/fallos
   - Permitir filtrar por cliente/fecha

4. **Ajuste dinámico de delays:**
   - Detectar errores de timeout
   - Aumentar delay automáticamente
   - Reintentar lote fallido

### Comandos Útiles

```bash
# Instalar dependencias
pnpm install

# Ejecutar dev server
pnpm dev

# Ejecutar tests
pnpm test

# Ejecutar test específico
pnpm test -- server/batch.test.ts

# Build producción
pnpm build

# Migrar DB
pnpm db:push
```

### Notas Importantes

1. **Defaults:** Todos los clientes nuevos obtienen `batchSize=10` y `batchDelaySeconds=3` automáticamente
2. **Compatibilidad:** Los clientes existentes sin estos campos usan los defaults
3. **Validación:** Frontend y backend validan rangos (1-100 para batch_size, 1-60 para delay)
4. **Transacciones:** Cada lote es independiente; si uno falla, los otros continúan
5. **Logging:** Todos los logs incluyen `[Egixia]` prefix para fácil filtrado

---

## Instrucciones para el Nuevo LLM

### Si necesitas hacer cambios:

1. **Modificar batch_size o batch_delay_seconds:**
   - Editar validación en `server/routers.ts` (líneas de `z.number()`)
   - Actualizar defaults si es necesario
   - Ejecutar `pnpm test` para verificar

2. **Agregar nueva funcionalidad de batch:**
   - Seguir patrón de `synchronizeBatch` en `server/routers.ts`
   - Usar `getClientCredentials()` para obtener batch config
   - Implementar loop de lotes con `sleep()` entre ellos
   - Agregar tests en `server/batch.test.ts`

3. **Cambiar UI de progreso:**
   - Modificar `useOCVerification.ts` para cambiar toasts
   - Actualizar `ClientsManagement.tsx` para cambiar columna "Lotes"
   - Ejecutar `pnpm test` para verificar tipos

4. **Agregar persistencia de logs:**
   - Crear tabla `batchLogs` en `drizzle/schema.ts`
   - Agregar función en `server/db.ts` para insertar logs
   - Llamar desde `synchronizeBatch` y `verifyPurchaseOrders`
   - Ejecutar `pnpm db:push`

### Estructura de Directorios Clave

```
egixia-oc-sync/
├── server/
│   ├── routers.ts           ← Endpoints tRPC (batch logic aquí)
│   ├── db.ts                ← Query helpers
│   ├── batch.test.ts        ← Tests de batch (NUEVO)
│   └── _core/               ← Framework internals (no tocar)
├── client/src/
│   ├── hooks/
│   │   └── useOCVerification.ts  ← Hook de batch (REESCRITO)
│   ├── pages/
│   │   └── ClientsManagement.tsx ← Tabla de clientes (MODIFICADA)
│   └── components/
│       └── ClientDialog.tsx      ← Formulario de cliente (sin cambios)
├── drizzle/
│   └── schema.ts            ← Schema DB (batch_size, batch_delay_seconds)
└── todo.md                  ← Tareas completadas/pendientes
```

### Checkpoint Disponible

Versión: `1dff8ce7`

Contiene toda la implementación de batch processing lista para producción.

---

## Resumen Técnico para Transferencia

**Cambio principal:** Todas las operaciones de verificación y sincronización ahora se dividen en lotes configurables por cliente, con delays entre lotes.

**Impacto:**
- ✅ Reduce carga en servidor de Egixia
- ✅ Evita timeouts con grandes volúmenes
- ✅ Configurable por cliente
- ✅ Totalmente testeable
- ✅ Logging completo

**Próxima prioridad:** Agregar barra de progreso en tiempo real o log de auditoría.
