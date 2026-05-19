# Egixia OC Sync

**Verificacion y Sincronizacion de Ordenes de Compra** - Mini App embebible en el Portal de Proveedores.

Permite cargar un lote de OCs desde Excel/CSV, verificar su estado de sincronizacion con el portal de proveedores, identificar proveedores no registrados, sincronizar por lotes y exportar resultados.

---

## Caracteristicas principales

- Carga de archivos Excel (.xlsx, .xls) o CSV con OCs
- Verificacion de existencia de proveedores en el portal
- Verificacion del estado de OCs contra la API de Egixia
- Sincronizacion por lotes con paralelismo (4 peticiones en paralelo, pausa 2s entre grupos)
- Reintento automatico de lotes fallidos por errores de red (ECONNRESET, socket hang up)
- Dashboard de KPIs: No encontradas, Sincronizadas, Anuladas, Proveedor no existe, Con error
- Filtros avanzados agrupados (AND dentro del grupo, OR entre grupos)
- Exportacion de resultados a CSV por paso
- Log de integraciones con historial completo por tipo de servicio
- Color primario personalizable via parametro URL: `?rgb=FF5722`
- Gestion multi-cliente con `clientKey`

---

## Stack tecnologico

| Capa | Tecnologia |
|---|---|
| Frontend | React 19 + Vite + Tailwind CSS 4 + shadcn/ui |
| Backend | Express 4 + tRPC 11 |
| Base de datos | MySQL / TiDB (Drizzle ORM) |
| Autenticacion | Manus OAuth + JWT |
| Almacenamiento | AWS S3 |
| Tests | Vitest (24 tests) |

---

## Instalacion local

```bash
# 1. Clonar el repositorio
git clone https://github.com/egixia-tecnico/web-ext-sync-purchase-order.git
cd web-ext-sync-purchase-order

# 2. Instalar dependencias
pnpm install

# 3. Configurar variables de entorno
# Crear .env con las variables requeridas (ver seccion Variables de entorno)

# 4. Sincronizar base de datos
pnpm db:push

# 5. Iniciar servidor de desarrollo
pnpm dev
```

---

## Variables de entorno requeridas

| Variable | Descripcion |
|---|---|
| `DATABASE_URL` | Cadena de conexion MySQL/TiDB |
| `JWT_SECRET` | Secreto para firmar cookies de sesion |
| `VITE_APP_ID` | ID de la aplicacion Manus OAuth |
| `OAUTH_SERVER_URL` | URL del servidor OAuth de Manus |
| `VITE_OAUTH_PORTAL_URL` | URL del portal de login Manus |
| `OWNER_OPEN_ID` | Open ID del propietario |
| `OWNER_NAME` | Nombre del propietario |
| `BUILT_IN_FORGE_API_URL` | URL de las APIs internas de Manus |
| `BUILT_IN_FORGE_API_KEY` | Token para APIs internas (server-side) |
| `VITE_FRONTEND_FORGE_API_KEY` | Token para APIs internas (frontend) |
| `VITE_FRONTEND_FORGE_API_URL` | URL de APIs internas para frontend |
| `SENDGRID_API_KEY` | API Key de SendGrid para emails |
| `SENDGRID_FROM_EMAIL` | Email remitente |

---

## Uso del parametro de color

El color primario de la interfaz se puede personalizar via URL para embeber en diferentes portales:

```
https://tudominio.com/?rgb=1565C0   # Azul corporativo
https://tudominio.com/?rgb=2E7D32   # Verde
https://tudominio.com/?rgb=FF5722   # Naranja
```

Si no se especifica, se usa el color por defecto (`#10b981` - verde esmeralda).

---

## Flujo de trabajo

```
1. Cargar archivo Excel/CSV con OCs
2. Verificar existencia de proveedores (grupos de 4 en paralelo)
3. Verificar estado de OCs en el portal (grupos de 4 en paralelo)
4. Revisar resultados y KPIs
5. Sincronizar OCs no encontradas (grupos de 4 en paralelo)
6. Exportar resultados finales
```

---

## Scripts disponibles

```bash
pnpm dev        # Servidor de desarrollo
pnpm build      # Build de produccion
pnpm test       # Ejecutar tests (Vitest)
pnpm db:push    # Sincronizar esquema de base de datos
pnpm format     # Formatear codigo (Prettier)
```

---

## Estructura del proyecto

```
client/src/
  components/     # Componentes UI reutilizables
  contexts/       # React contexts (OCSyncContext, ThemeColorContext)
  hooks/          # Hooks personalizados (useOCVerification)
  pages/          # Paginas de la aplicacion
  lib/            # Utilidades (file-parser, trpc)
server/
  routers.ts      # Procedimientos tRPC
  db.ts           # Helpers de base de datos
drizzle/
  schema.ts       # Esquema de base de datos
```

---

## Licencia

Propiedad de Egixia. Uso interno.
