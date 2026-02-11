/**
 * File Parser - Parseo de archivos Excel (.xlsx, .xls) y CSV
 * Extrae: buyer_external_code, provider_external_code, purchase_order_number
 */
import * as XLSX from "xlsx";
import type { OCRecord } from "@/contexts/OCSyncContext";

interface ParsedRow {
  buyer_external_code: string;
  provider_external_code: string;
  purchase_order_number: string;
}

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

        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });

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
    // Expect: buyer_code | provider_code | oc_number (tab or comma separated)
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
    provider_not_found: "Proveedor no existe",
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
