/**
 * ResultsTable - Tabla de resultados con paginación configurable, scroll visible.
 * Fechas "0000-00-00T00:00:00" se muestran en blanco.
 * Fechas en una sola columna (Fecha Doc / Fecha Sync).
 * Ordenamiento: no-sincronizados primero, sincronizados al final.
 * En step 3+: registros "synced" deseleccionados, los demás seleccionados.
 * Filtro controlado por activeKPIFilter del contexto (clic en KPI cards).
 */
import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOCSync, type OCRecord } from "@/contexts/OCSyncContext";
import { formatProviderCodes } from "@shared/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  UserX, AlertTriangle, Clock, Loader2, AlertOctagon, ChevronLeft, ChevronRight
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ReactNode }> = {
  pending: {
    label: "Pendiente",
    color: "text-slate-500",
    bgColor: "bg-slate-50",
    borderColor: "#94a3b8",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  checking: {
    label: "Verificando",
    color: "text-indigo-500",
    bgColor: "bg-indigo-50",
    borderColor: "#6366f1",
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  },
  synced: {
    label: "Sincronizada",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "#10b981",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  not_found: {
    label: "No encontrada",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "#f59e0b",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  supplier_not_exists: {
    label: "Proveedor no registrado",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "#f59e0b",
    icon: <UserX className="w-3.5 h-3.5" />,
  },
  error: {
    label: "Error",
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "#dc2626",
    icon: <AlertOctagon className="w-3.5 h-3.5" />,
  },
  synced_with_error: {
    label: "Sync con error",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "#f97316",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
};

/** Formatea fecha: si es "0000-00-00..." o vacía, retorna "" */
function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  if (dateStr.startsWith("0000-00-00") || dateStr === "0001-01-01T00:00:00") return "";
  // Try to format nicely
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
 * Calcula la fecha de última sincronización:
 * - Toma la fecha más alta entre synchronization_date y synchronization_date2
 * - Si ambas están vacías o el año es < 2020, retorna "Sin dato"
 */
function getLastSyncDate(date1?: string, date2?: string): string {
  const parseValidDate = (d?: string): Date | null => {
    if (!d) return null;
    if (d.startsWith("0000-00-00") || d === "0001-01-01T00:00:00") return null;
    try {
      const parsed = new Date(d);
      if (isNaN(parsed.getTime())) return null;
      if (parsed.getFullYear() < 2020) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const d1 = parseValidDate(date1);
  const d2 = parseValidDate(date2);

  let best: Date | null = null;
  if (d1 && d2) best = d1 > d2 ? d1 : d2;
  else if (d1) best = d1;
  else if (d2) best = d2;

  if (!best) return "Sin dato";

  return best.toLocaleDateString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }) + " " + best.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Priority for sorting: lower = first (non-synced first) */
const STATUS_SORT_PRIORITY: Record<string, number> = {
  error: 0,
  not_found: 1,
  supplier_not_exists: 2,
  synced_with_error: 3,
  pending: 4,
  checking: 5,
  synced: 6,
};

export default function ResultsTable() {
  const {
    records, selectedRecords, toggleSelection, selectAll, deselectAll,
    selectNonSynced, activeKPIFilter, currentStep
  } = useOCSync();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<keyof OCRecord>("purchase_order_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Reset page when filter changes
  useEffect(() => {
    setPage(0);
  }, [activeKPIFilter, searchTerm]);

  const filteredRecords = useMemo(() => {
    let result = [...records];

    // Apply KPI filter from context
    if (activeKPIFilter) {
      result = result.filter(r => r.status === activeKPIFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r.purchase_order_number.toLowerCase().includes(term) ||
        r.buyer_external_code.toLowerCase().includes(term) ||
        formatProviderCodes(r.provider_external_code_1, r.provider_external_code_2).toLowerCase().includes(term) ||
        (r.buyer_name || "").toLowerCase().includes(term) ||
        (r.provider_name || "").toLowerCase().includes(term) ||
        (r.statusMessage || "").toLowerCase().includes(term)
      );
    }

    // Always sort: non-synced first, synced last
    result.sort((a, b) => {
      const aPri = STATUS_SORT_PRIORITY[a.status || "pending"] ?? 4;
      const bPri = STATUS_SORT_PRIORITY[b.status || "pending"] ?? 4;
      if (aPri !== bPri) return aPri - bPri;
      const aVal = String(a[sortField] || "");
      const bVal = String(b[sortField] || "");
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    return result;
  }, [records, searchTerm, activeKPIFilter, sortField, sortDir]);

  const paginatedRecords = useMemo(() => {
    return filteredRecords.slice(page * pageSize, (page + 1) * pageSize);
  }, [filteredRecords, page, pageSize]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize);

  if (records.length === 0) return null;
  if (currentStep < 2) return null;

  const allFilteredSelected = filteredRecords.length > 0 && filteredRecords.every(r => selectedRecords.has(r.id));
  const someFilteredSelected = filteredRecords.some(r => selectedRecords.has(r.id)) && !allFilteredSelected;

  const handleSort = (field: keyof OCRecord) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const handleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      // Deselect all filtered
      deselectAll();
    } else {
      // Select all filtered
      const newIds = filteredRecords.map(r => r.id);
      newIds.forEach(id => {
        if (!selectedRecords.has(id)) {
          toggleSelection(id);
        }
      });
    }
  };

  const SortIcon = ({ field }: { field: keyof OCRecord }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  // Show date column from step 2+ (during and after verification)
  const showDateColumn = currentStep >= 2;
  // In step 5 (Exportar), hide checkboxes
  const showCheckboxes = currentStep !== 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="bg-card rounded-xl border shadow-sm overflow-hidden"
    >
      {/* Toolbar */}
      <div className="p-3 border-b flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por OC, comprador, proveedor..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filteredRecords.length} de {records.length} registros
            {selectedRecords.size > 0 && ` · ${selectedRecords.size} seleccionados`}
          </span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="w-[90px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 / pág</SelectItem>
              <SelectItem value="25">25 / pág</SelectItem>
              <SelectItem value="50">50 / pág</SelectItem>
              <SelectItem value="100">100 / pág</SelectItem>
              <SelectItem value="200">200 / pág</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table with visible scroll */}
      <div className="overflow-auto max-h-[500px]" style={{ scrollbarWidth: "thin", scrollbarColor: "#c4c4c4 transparent" }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
            <tr className="text-left">
              {showCheckboxes && (
                <th className="p-3 w-10">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={handleSelectAllFiltered}
                  />
                </th>
              )}
              <th className="p-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("purchase_order_number")}>
                <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nro. OC <SortIcon field="purchase_order_number" />
                </div>
              </th>
              <th className="p-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("buyer_external_code")}>
                <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Comprador <SortIcon field="buyer_external_code" />
                </div>
              </th>
              <th className="p-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("provider_external_code_1")}>
                <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Proveedor <SortIcon field="provider_external_code_1" />
                </div>
              </th>
              <th className="p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Estado
                </div>
              </th>
              {showDateColumn && (
                <th className="p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Fechas
                  </div>
                </th>
              )}
              <th className="p-3 hidden lg:table-cell">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Detalle
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {paginatedRecords.map((record, idx) => {
                const config = STATUS_CONFIG[record.status || "pending"];
                const isSelected = selectedRecords.has(record.id);
                const docDate = formatDate(record.portalData?.documentDate);
                const syncDate = formatDate(record.portalData?.synchronizationDate);
                const lastSyncDate = getLastSyncDate(record.synchronization_date, record.synchronization_date2);
                // supplierExists === false means supplier was verified and does NOT exist
                const supplierNotExists = record.supplierExists === false;

                return (
                  <motion.tr
                    key={record.id}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, delay: idx * 0.01 }}
                    className={`
                      border-b border-border/50 transition-colors
                      ${supplierNotExists
                        ? "opacity-50 bg-muted/20 cursor-not-allowed"
                        : `hover:bg-muted/30 ${isSelected ? "bg-primary/5" : ""}`
                      }
                    `}
                    style={{ borderLeft: `3px solid ${supplierNotExists ? "#e2e8f0" : config.borderColor}` }}
                  >
                    {showCheckboxes && (
                      <td className="p-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Checkbox
                                checked={supplierNotExists ? false : isSelected}
                                disabled={supplierNotExists}
                                onCheckedChange={supplierNotExists ? undefined : () => toggleSelection(record.id)}
                                className={supplierNotExists ? "cursor-not-allowed opacity-40" : ""}
                              />
                            </span>
                          </TooltipTrigger>
                          {supplierNotExists && (
                            <TooltipContent side="right">
                              <p className="text-xs">Proveedor no existe en el portal</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </td>
                    )}
                    <td className="p-3">
                      <span className="font-mono text-xs font-medium">{record.purchase_order_number}</span>
                    </td>
                    <td className="p-3">
                      <div>
                        <span className="font-mono text-xs">{record.buyer_external_code}</span>
                        {record.buyer_name && (
                          <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{record.buyer_name}</p>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div>
                        <span className="font-mono text-xs">{formatProviderCodes(record.provider_external_code_1, record.provider_external_code_2) || "—"}</span>
                        {record.provider_name && (
                          <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{record.provider_name}</p>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${config.color} ${config.bgColor}`}>
                        {config.icon}
                        <span className="hidden sm:inline">{config.label}</span>
                      </span>
                    </td>
                    {showDateColumn && (
                      <td className="p-3">
                        <div className="space-y-0.5">
                          {docDate && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground/60 uppercase w-8 shrink-0">Doc</span>
                              <span className="text-xs text-muted-foreground font-mono">{docDate}</span>
                            </div>
                          )}
                          {syncDate && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground/60 uppercase w-8 shrink-0">Sync</span>
                              <span className="text-xs text-muted-foreground font-mono">{syncDate}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-border/30">
                            <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase shrink-0">Ult. Sinc</span>
                            <span className={`text-xs font-mono ${
                              lastSyncDate === "Sin dato"
                                ? "text-muted-foreground/40 italic"
                                : "text-emerald-600 font-medium"
                            }`}>{lastSyncDate}</span>
                          </div>
                          {!docDate && !syncDate && lastSyncDate === "Sin dato" && (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="p-3 hidden lg:table-cell">
                      {supplierNotExists ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                          <UserX className="w-3.5 h-3.5 shrink-0" />
                          Proveedor no existe
                        </span>
                      ) : record.statusMessage ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground truncate max-w-[300px] block cursor-help">
                              {record.statusMessage.match(/^\[HTTP \d+\]/) ? (
                                <>
                                  <span className="font-semibold text-red-600">
                                    {record.statusMessage.match(/^\[HTTP \d+\]/)?.[0]}
                                  </span>
                                  {' '}
                                  {record.statusMessage.replace(/^\[HTTP \d+\]\s*/, '')}
                                </>
                              ) : (
                                record.statusMessage
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-md">
                            <p className="text-xs whitespace-pre-wrap">{record.statusMessage}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-3 border-t flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Mostrando {filteredRecords.length > 0 ? page * pageSize + 1 : 0}-{Math.min((page + 1) * pageSize, filteredRecords.length)} de {filteredRecords.length}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(0)}
            className="h-7 text-xs px-2"
          >
            <ChevronLeft className="w-3 h-3" />
            <ChevronLeft className="w-3 h-3 -ml-1.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="h-7 text-xs px-2"
          >
            <ChevronLeft className="w-3 h-3" />
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            {page + 1} / {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            className="h-7 text-xs px-2"
          >
            <ChevronRight className="w-3 h-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(totalPages - 1)}
            className="h-7 text-xs px-2"
          >
            <ChevronRight className="w-3 h-3" />
            <ChevronRight className="w-3 h-3 -ml-1.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
