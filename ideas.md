# Brainstorm de Diseño - Egixia OC Sync

## Contexto
Mini App Beta embebible en el portal de proveedores Egixia. Debe ser funcional, profesional, y adaptarse al color primario del cliente vía parámetro URL RGB. Es una herramienta de soporte/operaciones para verificar y sincronizar órdenes de compra por lotes.

---

<response>
<idea>

## Idea 1: "Swiss Data Console"

**Design Movement**: Estilo suizo / International Typographic Style aplicado a herramientas de datos operativos. Inspirado en paneles de control de infraestructura como Grafana y Datadog pero con la limpieza tipográfica suiza.

**Core Principles**:
1. Claridad informacional absoluta — cada dato tiene un propósito visual claro
2. Jerarquía tipográfica estricta — la tipografía es el sistema de navegación
3. Densidad controlada — máxima información útil sin saturación
4. Funcionalidad como estética — la belleza emerge de la utilidad

**Color Philosophy**: Base neutra con gris pizarra oscuro (#1e293b) para headers y un color primario configurable que actúa como "señal" para acciones y estados positivos. Uso de semáforo semántico: verde para sincronizado, ámbar para pendiente, rojo para error, gris para no encontrado. El color primario del cliente se usa en la barra superior, botones de acción principal y acentos de selección.

**Layout Paradigm**: Layout de consola con sidebar colapsable de navegación a la izquierda, área principal dividida en zona de entrada (superior) y zona de resultados (inferior) con paneles redimensionables. Dashboard de indicadores como tarjetas compactas en fila horizontal.

**Signature Elements**:
- Barra de estado tipo "terminal" en la parte inferior mostrando progreso de operaciones en tiempo real
- Indicadores numéricos grandes con micro-gráficos sparkline
- Tabla de datos con filas coloreadas por estado usando bordes laterales gruesos

**Interaction Philosophy**: Interacciones inmediatas con feedback visual constante. Drag & drop para archivos, selección múltiple con checkboxes, acciones por lotes con confirmación inline (no modales).

**Animation**: Transiciones de 200ms ease-out para cambios de estado. Números que "cuentan" al actualizarse (count-up animation). Barras de progreso con gradiente animado durante procesamiento por lotes. Fade-in escalonado para filas de tabla.

**Typography System**: 
- Display: "JetBrains Mono" para números y códigos (monoespaciada, técnica)
- Headers: "DM Sans" bold/semibold para títulos de sección
- Body: "DM Sans" regular para texto general
- Jerarquía: 32px títulos → 20px subtítulos → 14px body → 12px captions

</idea>
<text>Consola de datos estilo suizo con alta densidad informacional, tipografía monoespaciada para códigos, y layout de paneles redimensionables tipo IDE.</text>
<probability>0.07</probability>
</response>

---

<response>
<idea>

## Idea 2: "Operational Clarity"

**Design Movement**: Neo-Brutalism funcional mezclado con diseño de sistemas de información. Inspirado en interfaces de Bloomberg Terminal y herramientas de DevOps modernas como Linear, pero con un enfoque más accesible y limpio.

**Core Principles**:
1. Datos primero — la interfaz se subordina a la información
2. Estado visible — cada elemento comunica su condición actual
3. Flujo operativo — diseñado para workflows repetitivos y eficientes
4. Adaptabilidad cromática — el color primario permea sin dominar

**Color Philosophy**: Fondo blanco cálido (#fafaf9) con superficies en blanco puro para tarjetas. El color primario del cliente (configurable vía URL) se aplica como acento en: header bar, badges de estado positivo, botones primarios, y bordes de selección activa. Estados semánticos con colores fijos: emerald-500 para éxito, amber-500 para advertencia, rose-500 para error, slate-400 para inactivo. Sombras sutiles con tinte del color primario.

**Layout Paradigm**: Layout vertical de flujo único con secciones apiladas: (1) Header con branding + config, (2) Zona de carga de datos con tabs, (3) Panel de indicadores KPI en grid asimétrico 2-3-2, (4) Tabla de resultados con filtros laterales deslizantes. Sin sidebar — todo en flujo vertical para embeberse fácilmente en iframes.

**Signature Elements**:
- Badge "BETA" con efecto de pulso sutil en el header
- Tarjetas KPI con borde superior grueso (4px) del color semántico correspondiente
- Zona de drop de archivos con borde dashed animado y preview de datos

**Interaction Philosophy**: Workflow lineal guiado: cargar datos → verificar → revisar resultados → sincronizar seleccionados → exportar. Cada paso tiene feedback inmediato. Tooltips informativos en cada indicador. Selección de filas con shift+click para rangos.

**Animation**: Entrada de tarjetas KPI con stagger de 100ms y scale desde 0.95. Transición de tabs con slide horizontal. Skeleton loaders durante verificación. Confetti sutil al completar sincronización exitosa de un lote completo. Progress ring animado durante operaciones.

**Typography System**:
- Display: "Space Grotesk" para números grandes en KPIs y títulos principales
- Body: "Inter" weight 400/500 para texto general y tablas
- Mono: "Fira Code" para códigos de OC, códigos ERP y datos técnicos
- Jerarquía: 28px display → 18px section headers → 14px body → 11px metadata

</idea>
<text>Diseño operativo de flujo vertical optimizado para embeberse en iframes, con KPIs prominentes, zona de drag & drop, y workflow guiado paso a paso.</text>
<probability>0.08</probability>
</response>

---

<response>
<idea>

## Idea 3: "Enterprise Glass"

**Design Movement**: Glassmorphism empresarial con influencias de Material Design 3 y la estética de herramientas SaaS premium como Notion y Linear. Diseño que transmite modernidad y confianza corporativa.

**Core Principles**:
1. Transparencia operativa — el usuario siempre sabe qué está pasando
2. Profundidad con capas — uso de elevación y blur para crear jerarquía espacial
3. Modularidad visual — cada bloque funcional es una "tarjeta" independiente
4. Branding fluido — el color del cliente se integra orgánicamente

**Color Philosophy**: Fondo con gradiente muy sutil de slate-50 a stone-50. Tarjetas con fondo blanco y sombra con 2% de opacidad del color primario. El color primario del cliente se usa en: gradiente del header (primario → primario oscurecido 15%), iconos de acción, bordes de focus, y fill de gráficos. Paleta semántica: teal-500 éxito, orange-500 advertencia, red-500 error, zinc-400 neutro.

**Layout Paradigm**: Layout de dashboard con header fijo, contenido en grid responsive de 12 columnas. Sección superior: barra de herramientas con tabs (Verificar | Resultados | Sincronizar). Sección media: grid de tarjetas KPI (4 columnas en desktop, 2 en tablet, 1 en mobile). Sección inferior: tabla con sticky header y scroll virtual para grandes volúmenes.

**Signature Elements**:
- Header con efecto glass (backdrop-blur) y borde inferior con gradiente del color primario
- Donut charts animados dentro de las tarjetas KPI
- Stepper visual horizontal mostrando el progreso del flujo de trabajo

**Interaction Philosophy**: Interfaz de pestañas que guía el flujo pero permite saltar entre secciones. Drag & drop + click para cargar archivos. Filtros rápidos con chips clickeables. Acciones masivas con barra flotante al seleccionar filas (como Gmail).

**Animation**: Backdrop blur con transición de 300ms al hacer scroll. Donut charts con animación de draw-in al entrar en viewport. Hover en tarjetas con elevación sutil (translateY -2px + shadow increase). Toast notifications con slide-in desde la derecha. Loading states con shimmer effect.

**Typography System**:
- Display: "Plus Jakarta Sans" bold para títulos y números KPI
- Body: "Plus Jakarta Sans" regular/medium para contenido general
- Mono: "IBM Plex Mono" para códigos técnicos y datos de OC
- Jerarquía: 24px títulos → 16px subtítulos → 14px body → 12px labels → 11px captions

</idea>
<text>Dashboard empresarial con glassmorphism sutil, donut charts en KPIs, stepper de progreso, y diseño responsive de 12 columnas optimizado para embeberse.</text>
<probability>0.06</probability>
</response>

---

## Decisión

**Seleccionada: Idea 2 — "Operational Clarity"**

Razones:
1. El layout vertical de flujo único es ideal para embeberse en iframes del portal de proveedores
2. El workflow guiado (cargar → verificar → sincronizar → exportar) refleja exactamente el proceso operativo del cliente
3. Las tarjetas KPI con borde semántico resuelven directamente la queja del cliente sobre falta de indicadores
4. La zona de drag & drop simplifica la carga masiva de datos
5. Sin sidebar = máximo aprovechamiento del espacio en contexto embebido
6. La adaptabilidad cromática vía URL se integra naturalmente en el diseño
