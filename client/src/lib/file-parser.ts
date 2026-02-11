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
        const providerCol = findColumn(headers, PROVIDER_COLUMNS);
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
          const providerCode = providerCol !== -1 ? String(row[providerCol] || "").trim() : "";

          if (!ocNumber || !buyerCode) continue;

          idCounter++;
          records.push({
            id: `oc-${idCounter}-${Date.now()}`,
            buyer_external_code: buyerCode,
            provider_external_code: providerCode,
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

export function exportToCSV(records: OCRecord[]): string {
  const headers = [
    "Cod. Comprador",
    "Cod. Proveedor",
    "Nro. Orden Compra",
    "Estado",
    "Nombre Comprador",
    "Nombre Proveedor",
    "Proveedor Existe",
    "Mensaje",
  ];

  const statusLabels: Record<string, string> = {
    pending: "Pendiente",
    checking: "Verificando",
    synced: "Sincronizada",
    not_found: "No encontrada",
    supplier_not_exists: "Proveedor no existe",
    error: "Error",
    synced_with_error: "Sincronizada con error",
  };

  const rows = records.map(r => [
    r.buyer_external_code,
    r.provider_external_code,
    r.purchase_order_number,
    statusLabels[r.status || "pending"] || r.status,
    r.buyer_name || "",
    r.provider_name || "",
    r.provider_exists === undefined ? "" : r.provider_exists ? "Sí" : "No",
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
    "provider_external_code",
    "purchase_order_number",
  ];

  const exampleRows = [
    ["0100", "1222748", "3300293553"],
    ["0100", "1221267", "3300293554"],
    ["0230", "5001234", "4500012345"],
    ["0400", "9087654", "7700056789"],
  ];

  const templateData = [templateHeaders, ...exampleRows];
  const wsData = XLSX.utils.aoa_to_sheet(templateData);

  // Forzar TODAS las celdas a formato texto (@) para preservar ceros a la izquierda
  const range = XLSX.utils.decode_range(wsData["!ref"] || "A1:C5");
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
    ["provider_external_code", "Código ERP del proveedor", "No (recomendado)", "1222748"],
    ["purchase_order_number", "Número de la orden de compra", "Sí", "3300293553"],
    [""],
    ["NOMBRES ALTERNATIVOS ACEPTADOS:"],
    [""],
    ["Para buyer_external_code:", "codigo_comprador, cod_comprador, comprador, buyer_code, empresa, codigo_empresa"],
    ["Para provider_external_code:", "codigo_proveedor, cod_proveedor, proveedor, provider_code, vendor, supplier"],
    ["Para purchase_order_number:", "numero_oc, nro_oc, oc, orden_compra, purchase_order, po_number, numero_orden"],
    [""],
    ["NOTAS IMPORTANTES:"],
    [""],
    ["1. La primera fila debe contener los encabezados de las columnas."],
    ["2. Los datos de ejemplo en la hoja 'Ordenes de Compra' deben ser reemplazados con datos reales."],
    ["3. El código de proveedor es opcional pero recomendado para la validación de existencia."],
    ["4. Para el comprador 0230, el código de proveedor se busca en external_code_2."],
    ["5. Para los demás compradores, el código de proveedor se busca en external_code_1."],
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
