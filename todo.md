# Project TODO

- [x] Layout principal con diseño "Operational Clarity"
- [x] Personalización de color vía URL (?rgb=FF5722)
- [x] Componente DataUploader con drag & drop y entrada manual
- [x] Componente KPIDashboard con tarjetas de indicadores
- [x] Componente ResultsTable con filtros y selección
- [x] Componente ActionBar con verificar, sincronizar, exportar
- [x] Componente WorkflowStepper visual
- [x] Componente AppHeader con badge Beta
- [x] Componente ApiConfigDialog
- [x] Descarga de plantilla Excel (.xlsx) con formato texto
- [x] Toasts en parte superior de la pantalla (top-center)
- [x] Todos los registros seleccionados por defecto al cargar
- [x] Sin banner "Conexión API requerida"
- [x] Proxy backend para evitar CORS con API de Egixia
- [x] Credenciales por defecto almacenadas en base de datos (Manuelita)
- [x] Manejo de error 403 con mensaje indicando servicio sin permisos
- [x] Flujo: verificar OC → si no encontrada, validar proveedor con supplier_exists (external_code_1) → actualizar estado
- [x] Token dinámico con renovación automática en error 401
- [x] Resolver conflictos del upgrade web-db-user (Home.tsx)
- [x] ApiConfigDialog: campos en blanco al editar, enmascaramiento de credenciales
- [x] Dominio base intercambiable en configuración
- [x] Auto-conexión al iniciar con credenciales de DB
- [x] Tests de Vitest (11 tests pasando)
- [x] BUG: Conexión falla en producción (publicado) - corregido: upsertApiConfig duplicaba registros, testConnection enviaba undefined, agregado logging detallado
- [x] Eliminar filtros rápidos (Todos, No encontradas, Sin proveedor) de la tabla
- [x] Step Verificar: ocultar KPIs y botón exportar, mostrar solo botón "Verificar pendientes"
- [x] Step Resultados: mostrar KPIs (sincronizadas, no encontradas, proveedor no existente), clic en KPI filtra grid, habilitar exportar, mostrar fecha documento y fecha sincronización
- [x] Step Resultados: paginación de 10 registros por defecto, opción hasta 200, scroll visible
- [x] Step Resultados: botones ir al paso anterior o siguiente
- [x] Step Sincronizar: seleccionar por defecto registros con error y no encontradas, ordenar primero
- [x] Step Sincronizar: botón "Sincronizar seleccionados X de Y", ejecutar sincronización y actualizar grid
- [x] Fechas "0000-00-00T00:00:00" mostrar en blanco
- [x] Unificar fechas en una sola columna (Fecha Doc / Fecha Sync)
- [x] Exportar CSV con cada dato del grid en columnas independientes (Fecha Documento y Fecha Sincronización separadas)
- [x] Step Resultados: seleccionar solo registros NO sincronizados, deseleccionar sincronizados
- [x] Step Resultados: ordenar grid con no-sincronizados primero, sincronizados al final
- [x] Botón Sincronizar muestra "Sincronizar X de Y" con conteo dinámico
- [x] Al sincronizar pasa al step final Exportar con grid actualizado sin opción de re-sincronizar
- [x] Botón "Sincronizar X de Y" en step Resultados pasa directamente al step Sincronizar y ejecuta integración automáticamente sin botones adicionales
- [x] BUG: Proveedor 1204860 se marca como "no existe" - corregido: aplicado trim() a todos los códigos antes de enviar a API
- [ ] Aplicar trim() a códigos de proveedor que vienen de la respuesta de la API (no solo al enviar)
- [x] Agregar vista de historial de verificaciones en el menú de configuración (desplegable en header con Settings + History)
- [x] BUG CRÍTICO: Proveedor 1204860 existe pero se marca como "Proveedor no existe" - debe ir a "No encontradas" si OC no existe pero proveedor SÍ (corregido en checkpoint anterior)

## Gestión de Clientes Multi-tenant
- [x] Crear tabla `clients` en drizzle/schema.ts con campos: id, name, baseUrl, userName, password (encrypted), clientId (encrypted), clientSecret (encrypted), primaryColor, isActive, createdAt
- [x] Implementar sistema de encriptación/desencriptación para campos sensibles usando crypto (AES-256-CBC)
- [x] Crear helpers en server/db.ts: getClients, getClientById, createClient, updateClient, deleteClient, getActiveClient, setActiveClient
- [x] Crear endpoints tRPC en server/routers.ts: clients.list, clients.getById, clients.create, clients.update, clients.delete, clients.getActive, clients.setActive
- [x] Crear página client/src/pages/ClientsManagement.tsx con lista de clientes (nombre, color, usuario visible, datos sensibles enmascarados)
- [x] Crear componente ClientDialog para crear/editar clientes con formulario completo
- [x] Agregar enlace "Gestión de Clientes" en el menú desplegable del header
- [x] Modificar getActiveClientCredentials() para usar credenciales del cliente activo con fallback a api_configs (backward compatibility)
- [x] Actualizar todos los endpoints (verifyBatch, checkSupplier, testConnection) para usar getActiveClientCredentials()
- [x] Actualizar tests para reflejar el nuevo sistema de clientes (18 tests pasando)
- [x] ThemeColorContext carga automáticamente el color del cliente activo (prioridad: URL param > cliente activo > default)
- [x] Validación: si no hay cliente activo ni api_configs, mostrar mensaje solicitando configuración

## Sistema de Identificación por ClientKey en URL
- [x] Agregar campo `clientKey` (varchar único) a la tabla `clients` en drizzle/schema.ts
- [x] Ejecutar migración de base de datos con pnpm db:push
- [x] Crear endpoint tRPC `clients.getByKey` para buscar cliente por clientKey
- [x] Crear contexto React `ClientKeyContext` para almacenar clientKey de la sesión
- [x] Leer parámetro `?clientKey=XXX` de la URL al cargar la aplicación
- [x] Persistir clientKey en sessionStorage para mantenerlo durante la navegación
- [x] Modificar `getActiveClientCredentials()` para aceptar clientKey como parámetro opcional y priorizar: clientKey pasado > cliente isActive > api_configs legacy
- [x] Agregar campo clientKey en ClientDialog (formulario de crear/editar cliente)
- [x] Mostrar clientKey en la tabla de ClientsManagement
- [x] Agregar validación: clientKey debe ser único y alfanumérico (sin espacios ni caracteres especiales)
- [x] Actualizar useOCVerification para pasar clientKey en cada llamada tRPC
- [x] Actualizar ThemeColorContext para usar clientKey en lugar de cliente activo
- [x] Eliminar ApiConfigDialog y referencias obsoletas (ahora se usa sistema de clientes)
- [x] Formato de URL: `https://app.manus.space?clientKey=manuelita`

## Campo de Reglas de Sincronización
- [x] Agregar campo `syncRules` (text nullable) a la tabla `clients` en drizzle/schema.ts
- [x] Ejecutar migración de base de datos con pnpm db:push
- [x] Agregar syncRules al input schema de endpoints create y update en routers.ts
- [x] Agregar campo syncRules en ClientDialog (textarea) para crear/editar reglas
- [x] Mostrar reglas de sincronización en useOCVerification cuando haya OCs no sincronizadas (toast informativo)
- [x] El endpoint verifyPurchaseOrders devuelve clientInfo con syncRules

## Validación Obligatoria de ClientKey
- [x] Crear componente ClientKeyRequired.tsx que muestre error si no hay clientKey
- [x] Modificar Home.tsx para verificar clientKey y mostrar ClientKeyRequired si no existe
- [x] Bloquear acceso a verificación/sincronización si no hay clientKey válido
- [x] Agregar documentación en README_USAGE.md sobre formato de URL requerido
- [x] Ejemplos de URL: `https://app.manus.space?clientKey=manuelita`, `?clientKey=palmar`, `?clientKey=farmatodo`

## Botón de Prueba de Conexión en ClientDialog
- [x] Agregar botón "Probar Conexión" en ClientDialog antes de guardar
- [x] Crear endpoint tRPC `clients.testConnection` que reciba credenciales temporales
- [x] El endpoint consume getToken con las credenciales proporcionadas y valida respuesta
- [x] Mostrar toast de éxito/error según resultado de la prueba
- [x] Botón cambia a "Conexión OK" con borde verde cuando la prueba es exitosa
- [x] Estado de conexión se resetea cuando se modifican las credenciales
