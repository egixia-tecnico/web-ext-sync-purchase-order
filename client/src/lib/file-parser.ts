/**
 * File Parser - Parseo de archivos Excel (.xlsx, .xls) y CSV
 * Extrae: buyer_external_code, provider_external_code, purchase_order_number
 * Todas las columnas se tratan como texto para preservar ceros a la izquierda.
 */
import * as XLSX from "xlsx";
import type { OCRecord } from "@/contexts/OCSyncContext";

// Column name mappings (case-insensitive)
const BUYER_COLUMNS = [
  "buyer_external_code", "codigo_comprador", "cod_comprador", "comprador",
  "buyer_code", "empresa", "codigo_empresa", "cod_empresa", "buyer",
  "empresa_compradora", "codigo_erp_comprador", "cod_erp_comprador",
];

const PROVIDER_COLUMNS_1 = [
  "provider_external_code_1", "codigo_proveedor_1", "cod_proveedor_1",
  "provider_code_1", "codigo_erp_proveedor_1", "cod_erp_proveedor_1",
];

const PROVIDER_COLUMNS_2 = [
  "provider_external_code_2", "codigo_proveedor_2", "cod_proveedor_2",
  "provider_code_2", "codigo_erp_proveedor_2", "cod_erp_proveedor_2",
];

// Deprecated - mantener para compatibilidad con archivos antiguos
const PROVIDER_COLUMNS = [
  "provider_external_code", "codigo_proveedor", "cod_proveedor", "proveedor",
  "provider_code", "provider", "codigo_erp_proveedor", "cod_erp_proveedor",
  "vendor", "vendor_code", "supplier", "supplier_code",
];

const OC_COLUMNS = [
  "purchase_order_number", "numero_oc", "nro_oc", "oc", "orden_compra",
  "purchase_order", "po_number", "po", "numero_orden", "nro_orden",
  "orden", "pedido", "numero_pedido",
];

function findColumn(headers: string[], candidates: string[]): number {
  const normalizedHeaders = headers.map(h => 
    h.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_")
  );
  
  for (const candidate of candidates) {
    const idx = normalizedHeaders.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  
  // Partial match
  for (const candidate of candidates) {
    const idx = normalizedHeaders.findIndex(h => h.includes(candidate) || candidate.includes(h));
    if (idx !== -1) return idx;
  }
  
  return -1;
}

export function parseFileData(file: File): Promise<OCRecord[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("No se pudo leer el archivo");

        // Leer con raw: true para tratar todo como texto y preservar ceros
        const workbook = XLSX.read(data, { type: "array", raw: true });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, raw: false, defval: "" });

        if (jsonData.length < 2) {
          throw new Error("El archivo debe tener al menos una fila de encabezados y una fila de datos");
        }

        const headers = jsonData[0].map(String);
        const buyerCol = findColumn(headers, BUYER_COLUMNS);
        const providerCol1 = findColumn(headers, PROVIDER_COLUMNS_1);
        const providerCol2 = findColumn(headers, PROVIDER_COLUMNS_2);
        const providerColLegacy = findColumn(headers, PROVIDER_COLUMNS);
        const ocCol = findColumn(headers, OC_COLUMNS);

        if (ocCol === -1) {
          throw new Error(
            "No se encontró la columna de número de orden de compra. " +
            "Columnas esperadas: " + OC_COLUMNS.slice(0, 5).join(", ") + "..."
          );
        }

        if (buyerCol === -1) {
          throw new Error(
            "No se encontró la columna de código de comprador. " +
            "Columnas esperadas: " + BUYER_COLUMNS.slice(0, 5).join(", ") + "..."
          );
        }

        const records: OCRecord[] = [];
        let idCounter = 0;

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;

          const ocNumber = String(row[ocCol] || "").trim();
          const buyerCode = String(row[buyerCol] || "").trim();
          const providerCode1 = providerCol1 !== -1 ? String(row[providerCol1] || "").trim() : (providerColLegacy !== -1 ? String(row[providerColLegacy] || "").trim() : "");
          const providerCode2 = providerCol2 !== -1 ? String(row[providerCol2] || "").trim() : "";

          if (!ocNumber || !buyerCode) continue;

          idCounter++;
          records.push({
            id: `oc-${idCounter}-${Date.now()}`,
            buyer_external_code: buyerCode,
            provider_external_code: providerCode1, // Deprecated - mantener para compatibilidad
            provider_external_code_1: providerCode1,
            provider_external_code_2: providerCode2,
            purchase_order_number: ocNumber,
            status: "pending",
          });
        }

        if (records.length === 0) {
          throw new Error("No se encontraron registros válidos en el archivo");
        }

        resolve(records);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error("Error al leer el archivo"));
    reader.readAsArrayBuffer(file);
  });
}

export function parseManualInput(text: string): OCRecord[] {
  const lines = text.trim().split("\n").filter(l => l.trim());
  const records: OCRecord[] = [];
  let idCounter = 0;

  for (const line of lines) {
    const parts = line.split(/[,;\t|]+/).map(p => p.trim());
    if (parts.length < 2) continue;

    idCounter++;
    const buyerCode = parts[0];
    const providerCode = parts.length >= 3 ? parts[1] : "";
    const ocNumber = parts.length >= 3 ? parts[2] : parts[1];

    if (!buyerCode || !ocNumber) continue;

    records.push({
      id: `manual-${idCounter}-${Date.now()}`,
      buyer_external_code: buyerCode,
      provider_external_code: providerCode,
      purchase_order_number: ocNumber,
      status: "pending",
    });
  }

  return records;
}

/** Formatea fecha para exportación: si es "0000-00-00..." o vacía, retorna "" */
function formatDateForExport(dateStr?: string): string {
  if (!dateStr) return "";
  if (dateStr.startsWith("0000-00-00") || dateStr === "0001-01-01T00:00:00") return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }) + " " + d.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return dateStr;
  }
}

/**
 * Calcula la fecha de última sincronización para exportación.
 * Misma lógica que ResultsTable: usa los 3 campos y retorna la más reciente en dd/mm/aaaa hh:mm.
 */
function getLastSyncDateForExport(date1?: string, date2?: string, manualDate?: string): string {
  const parseValidDate = (d?: string): Date | null => {
    if (!d) return null;
    if (d.startsWith("0000-00-00") || d === "0001-01-01T00:00:00") return null;
    try {
      const parsed = new Date(d);
      if (isNaN(parsed.getTime())) return null;
      if (parsed.getFullYear() <= 2000) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  if (manualDate === undefined) {
    const d1 = parseValidDate(date1);
    const d2 = parseValidDate(date2);
    let best: Date | null = null;
    if (d1 && d2) best = d1 > d2 ? d1 : d2;
    else if (d1) best = d1;
    else if (d2) best = d2;
    if (!best) return "";
    return formatDateDDMMYYYYExport(best);
  }

  const d1 = parseValidDate(date1);
  const d2 = parseValidDate(date2);
  const d3 = parseValidDate(manualDate);
  const dates = [d1, d2, d3].filter((d): d is Date => d !== null);
  if (dates.length === 0) return "Sin dato";
  const best = dates.reduce((a, b) => (a > b ? a : b));
  return formatDateDDMMYYYYExport(best);
}

function formatDateDDMMYYYYExport(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function exportToCSV(records: OCRecord[]): string {
  const headers = [
    "Nro. Orden Compra",
    "Cod. Comprador",
    "Nombre Comprador",
    "Cod. Proveedor 1",
    "Cod. Proveedor 2",
    "Nombre Proveedor",
    "Estado",
    "Despacho",
    "Fecha Documento",
    "Ult. Sincronización",
    "Proveedor Existe",
    "Detalle",
  ];

  const statusLabels: Record<string, string> = {
    pending: "Pendiente",
    checking: "Verificando",
    synced: "Sincronizada",
    not_found: "No encontrada",
    canceled: "Anulada",
    supplier_not_exists: "Proveedor no existe",
    error: "Error",
    synced_with_error: "Sincronizada con error",
  };

  const rows = records.map(r => [
    r.purchase_order_number,
    r.buyer_external_code,
    r.buyer_name || "",
    r.provider_external_code_1 || r.provider_external_code || "",
    r.provider_external_code_2 || "",
    r.provider_name || "",
    statusLabels[r.status || "pending"] || r.status || "",
    r.delivery_status || r.portalData?.deliveryStatus || "",
    formatDateForExport(r.document_date || r.portalData?.documentDate),
    getLastSyncDateForExport(r.synchronization_date, r.synchronization_date2, r.manual_date_synch),
    r.supplierExists === undefined ? "" : r.supplierExists ? "Sí" : "No",
    r.statusMessage || "",
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return csvContent;
}

export function downloadCSV(records: OCRecord[], filename: string = "resultado_verificacion_oc.csv") {
  const csv = exportToCSV(records);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Genera y descarga una plantilla Excel (.xlsx) con el formato requerido
 * para la carga masiva de órdenes de compra.
 * TODAS las columnas están en formato TEXTO para preservar ceros a la izquierda.
 * Incluye: encabezados, formato de columnas, ejemplos y hoja de instrucciones.
 */
export function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  // --- Hoja 1: Plantilla de datos ---
  const templateHeaders = [
    "buyer_external_code",
    "provider_external_code_1",
    "provider_external_code_2",
    "purchase_order_number",
  ];

  const exampleRows = [
    ["0100", "1222748", "", "3300293553"],
    ["0100", "1221267", "", "3300293554"],
    ["0230", "", "5001234", "4500012345"],
    ["0400", "9087654", "", "7700056789"],
  ];

  const templateData = [templateHeaders, ...exampleRows];
  const wsData = XLSX.utils.aoa_to_sheet(templateData);

  // Forzar TODAS las celdas a formato texto (@) para preservar ceros a la izquierda
  const range = XLSX.utils.decode_range(wsData["!ref"] || "A1:D5");
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (wsData[cellRef]) {
        wsData[cellRef].t = "s"; // tipo string
        wsData[cellRef].z = "@"; // formato texto
      }
    }
  }

  // Ancho de columnas
  wsData["!cols"] = [
    { wch: 22 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
  ];

  XLSX.utils.book_append_sheet(wb, wsData, "Ordenes de Compra");

  // --- Hoja 2: Instrucciones ---
  const instructions = [
    ["INSTRUCCIONES DE USO - Plantilla OC Sync"],
    [""],
    ["Esta plantilla permite cargar órdenes de compra para verificar su estado de sincronización con el portal de proveedores."],
    [""],
    ["IMPORTANTE: Todas las columnas están en formato TEXTO para preservar ceros a la izquierda en los códigos."],
    [""],
    ["COLUMNAS REQUERIDAS:"],
    [""],
    ["Columna", "Descripción", "Obligatorio", "Ejemplo"],
    ["buyer_external_code", "Código ERP de la empresa compradora", "Sí", "0100"],
    ["provider_external_code_1", "Código ERP del proveedor (principal)", "No (recomendado)", "1222748"],
    ["provider_external_code_2", "Código ERP del proveedor (alternativo)", "No", "5001234"],
    ["purchase_order_number", "Número de la orden de compra", "Sí", "3300293553"],
    [""],
    ["NOMBRES ALTERNATIVOS ACEPTADOS:"],
    [""],
    ["Para buyer_external_code:", "codigo_comprador, cod_comprador, comprador, buyer_code, empresa, codigo_empresa"],
    ["Para provider_external_code_1:", "codigo_proveedor_1, cod_proveedor_1, provider_code_1"],
    ["Para provider_external_code_2:", "codigo_proveedor_2, cod_proveedor_2, provider_code_2"],
    ["Para purchase_order_number:", "numero_oc, nro_oc, oc, orden_compra, purchase_order, po_number, numero_orden"],
    [""],
    ["NOTAS IMPORTANTES:"],
    [""],
    ["1. La primera fila debe contener los encabezados de las columnas."],
    ["2. Los datos de ejemplo en la hoja 'Ordenes de Compra' deben ser reemplazados con datos reales."],
    ["3. Los códigos de proveedor son opcionales pero recomendados para la validación de existencia."],
    ["4. provider_external_code_1: Código principal del proveedor (usado por la mayoría de compradores)."],
    ["5. provider_external_code_2: Código alternativo del proveedor (usado por algunos compradores)."],
    ["6. Formatos aceptados: .xlsx, .xls, .csv"],
    ["7. NO cambie el formato de las columnas. Deben permanecer como TEXTO."],
    [""],
    ["Desarrollado por Egixia - OC Sync Beta"],
  ];

  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  wsInstructions["!cols"] = [
    { wch: 30 },
    { wch: 70 },
    { wch: 18 },
    { wch: 18 },
  ];

  wsInstructions["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 3 } },
  ];

  XLSX.utils.book_append_sheet(wb, wsInstructions, "Instrucciones");

  // Generar y descargar
  const now = new Date();
  const dateStr = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}_${String(now.getDate()).padStart(2, "0")}`;
  const filename = `plantilla_oc_sync_${dateStr}.xlsx`;
  
  XLSX.writeFile(wb, filename);
}
