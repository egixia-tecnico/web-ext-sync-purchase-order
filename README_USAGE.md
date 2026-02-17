# Egixia OC Sync - Guía de Uso

## Descripción

**Egixia OC Sync** es una aplicación web para verificar y sincronizar órdenes de compra con el portal de proveedores. Permite cargar lotes de órdenes desde Excel/CSV, verificar su estado de sincronización, validar la existencia de proveedores y sincronizar las que no estén en el portal.

## Requisitos Previos

Para usar la aplicación, **es obligatorio** contar con un **Client Key** (llave de cliente) que identifica a su organización y carga automáticamente las credenciales, configuración y reglas de sincronización específicas.

## Formato de URL

La aplicación **requiere** que el `clientKey` se pase como parámetro en la URL:

```
https://[dominio]/?clientKey=su_identificador
```

### Ejemplos de URLs válidas:

```
https://app.manus.space/?clientKey=manuelita
https://app.manus.space/?clientKey=palmar
https://app.manus.space/?clientKey=farmatodo
```

### ¿Qué pasa si no proporciono el clientKey?

Si intenta acceder a la aplicación sin el parámetro `clientKey` en la URL, verá una pantalla de error que bloquea el acceso y le solicita agregar el identificador correcto.

## Configuración de Clientes

### Acceso a la Gestión de Clientes

1. Haga clic en el menú desplegable del header (icono de usuario o menú)
2. Seleccione **"Gestión de Clientes"**
3. Verá la lista de clientes configurados con sus datos enmascarados

### Crear un Nuevo Cliente

1. En la pantalla de Gestión de Clientes, haga clic en **"Nuevo Cliente"**
2. Complete el formulario con los siguientes datos:

   - **Client Key** (obligatorio): Identificador único alfanumérico (ej: `manuelita`, `palmar_ve`)
   - **Nombre** (obligatorio): Nombre descriptivo del cliente (ej: "Manuelita Colombia")
   - **Dominio Base** (obligatorio): URL del servicio API (ej: `https://egixia.net/ProveedoresManuelita/`)
   - **Usuario** (obligatorio): Usuario para autenticación
   - **Contraseña** (obligatoria): Contraseña del usuario
   - **Client ID** (obligatorio): ID de cliente para OAuth
   - **Client Secret** (obligatorio): Secret de cliente para OAuth
   - **Color Primario**: Color hexadecimal para personalizar la interfaz (ej: `#10b981`)
   - **Reglas de Sincronización** (opcional): Texto libre con las reglas de negocio del cliente

3. **Probar Conexión**: Antes de guardar, haga clic en el botón **"Probar Conexión"** para validar que las credenciales son correctas. El sistema intentará obtener un token de autenticación con los datos proporcionados.

4. Si la conexión es exitosa, haga clic en **"Crear"** para guardar el cliente.

### Editar un Cliente Existente

1. En la lista de clientes, haga clic en el botón **"Editar"** del cliente que desea modificar
2. Actualice los campos necesarios
3. Pruebe la conexión nuevamente si modificó credenciales
4. Haga clic en **"Actualizar"** para guardar los cambios

### Activar/Desactivar un Cliente

El campo **"Activar este cliente"** permite controlar si un cliente puede conectarse o no. Si un cliente está desactivado (`isActive = false`), no podrá usarse para verificaciones ni sincronizaciones, incluso si se proporciona su `clientKey` en la URL.

## Flujo de Trabajo

### Paso 1: Cargar Datos

1. Acceda a la aplicación con su `clientKey` en la URL
2. Descargue la plantilla Excel haciendo clic en **"Descargar Plantilla"**
3. Complete la plantilla con las órdenes de compra que desea verificar
4. Cargue el archivo Excel/CSV usando el botón **"Cargar archivo"** o arrastre y suelte

### Paso 2: Verificar

1. Revise la lista de órdenes cargadas
2. Haga clic en **"Verificar pendientes"** para iniciar la verificación
3. El sistema consultará el portal de proveedores y validará la existencia de cada OC y proveedor

### Paso 3: Resultados

1. Revise los indicadores KPI (sincronizadas, no encontradas, proveedor no existe)
2. Haga clic en un KPI para filtrar la tabla por ese estado
3. Revise las fechas de documento y sincronización
4. Si hay órdenes no sincronizadas, verá las **reglas de sincronización** configuradas para su cliente

### Paso 4: Sincronizar

1. Seleccione las órdenes que desea sincronizar (por defecto se seleccionan las no encontradas y con error)
2. Haga clic en **"Sincronizar X de Y"** para enviar las órdenes al portal
3. El sistema ejecutará la sincronización automáticamente

### Paso 5: Exportar

1. Revise los resultados finales
2. Haga clic en **"Exportar CSV"** para descargar el reporte completo con todas las columnas

## Historial de Verificaciones

Para consultar el historial de verificaciones anteriores:

1. Haga clic en el menú desplegable del header
2. Seleccione **"Historial de Verificaciones"**
3. Verá las últimas 20 ejecuciones con fecha, duración y resultados

## Personalización por Cliente

Cada cliente puede tener:

- **Color primario personalizado**: La interfaz se adapta automáticamente al color configurado
- **Reglas de sincronización propias**: Texto informativo que se muestra cuando hay OCs no sincronizadas
- **Credenciales independientes**: Cada cliente se conecta a su propio dominio base con sus propias credenciales

## Soporte

Si necesita solicitar un `clientKey` o tiene problemas con la aplicación, contacte a:

- **Email**: soporte@egixia.com
- **Equipo**: Egixia Integraciones

## Notas Técnicas

- Los datos sensibles (contraseñas, Client ID, Client Secret) se almacenan encriptados con AES-256-CBC
- El `clientKey` se persiste en `sessionStorage` durante la navegación
- La aplicación soporta múltiples instancias abiertas en paralelo con diferentes clientes
- El token de autenticación se renueva automáticamente cuando expira
