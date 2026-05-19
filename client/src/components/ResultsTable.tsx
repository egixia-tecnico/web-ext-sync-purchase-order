/**
 * ResultsTable - Tabla de resultados con paginación configurable, scroll visible.
 * Fechas "0000-00-00T00:00:00" se muestran en blanco.
 * Columna Despacho con delivery_status.
 * Filtros avanzados rápidos: estado, despacho, proveedor, Ult. Sinc.
 * Ordenamiento: no-sincronizados primero, sincronizados al final.
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
import { Badge } from "@/components/ui/badge";
import {
  Search, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  UserX, AlertTriangle, Clock, Loader2, AlertOctagon, ChevronLeft, ChevronRight,
  Filter, X, Truck
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
  canceled: {
    label: "Anulada",
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "#7c3aed",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  synced_with_error: {
    label: "Sync con error",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "#f97316",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
};

/** Colores para delivery_status */
function getDeliveryBadge(status?: string): { label: string; className: string } {
  if (!status || status.trim() === "") return { label: "—", className: "text-muted-foreground/40 bg-transparent border-0 shadow-none" };
  const s = status.trim().toLowerCase();
  if (s.includes("entregad") || s.includes("complet") || s.includes("delivered")) {
    return { label: status, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  if (s.includes("parcia") || s.includes("partial")) {
    return { label: status, className: "bg-blue-50 text-blue-700 border-blue-200" };
  }
  if (s.includes("pendient") || s.includes("pending") || s.includes("abiert") || s.includes("open")) {
    return { label: status, className: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  if (s.includes("cancel") || s.includes("anulad")) {
    return { label: status, className: "bg-red-50 text-red-700 border-red-200" };
  }
  return { label: status, className: "bg-slate-50 text-slate-600 border-slate-200" };
}

/** Formatea fecha: si es "0000-00-00..." o vacía, retorna "" */
function formatDate(dateStr?: string): string {
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
 * Calcula la fecha de última sincronización:
 * - Si manual_date_synch no viene del servicio → dato vacío ("")
 * - Si manual_date_synch, synchronization_date y synchronization_date2 están vacíos o año ≤ 2000 → "Sin dato"
 * - Sino: muestra la fecha más reciente de los 3 campos en formato dd/mm/aaaa hh:mm
 */
function getLastSyncDate(date1?: string, date2?: string, manualDate?: string): { text: string; isEmpty: boolean } {
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

  // Si manual_date_synch no viene del servicio (undefined), retornar vacío
  // Nota: si viene como string vacío "", se trata como campo presente pero sin valor
  if (manualDate === undefined) {
    // El campo no vino en la respuesta del servicio
    // Aún así evaluamos date1 y date2
    const d1 = parseValidDate(date1);
    const d2 = parseValidDate(date2);
    let best: Date | null = null;
    if (d1 && d2) best = d1 > d2 ? d1 : d2;
    else if (d1) best = d1;
    else if (d2) best = d2;
    if (!best) return { text: "", isEmpty: true };
    return { text: formatDateDDMMYYYY(best), isEmpty: false };
  }

  const d1 = parseValidDate(date1);
  const d2 = parseValidDate(date2);
  const d3 = parseValidDate(manualDate);

  const dates = [d1, d2, d3].filter((d): d is Date => d !== null);

  if (dates.length === 0) return { text: "Sin dato", isEmpty: true };

  const best = dates.reduce((a, b) => (a > b ? a : b));
  return { text: formatDateDDMMYYYY(best), isEmpty: false };
}

/** Formatea una fecha como dd/mm/aaaa hh:mm */
function formatDateDDMMYYYY(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/** Priority for sorting: lower = first (non-synced first) */
const STATUS_SORT_PRIORITY: Record<string, number> = {
  error: 0,
  not_found: 1,
  canceled: 2,
  supplier_not_exists: 3,
  synced_with_error: 4,
  pending: 5,
  checking: 6,
  synced: 7,
};

type QuickFilter = {
  id: string;
  label: string;
  fn: (r: OCRecord) => boolean;
  color: string;
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
  const [showFilters, setShowFilters] = useState(false);
  const [activeQuickFilters, setActiveQuickFilters] = useState<Set<string>>(new Set());

  // Reset page when filter changes
  useEffect(() => {
    setPage(0);
  }, [activeKPIFilter, searchTerm, activeQuickFilters]);

  // Collect unique delivery_status values from records
  const deliveryStatuses = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      const ds = r.delivery_status || r.portalData?.deliveryStatus;
      if (ds && ds.trim()) set.add(ds.trim());
    });
    return Array.from(set).sort();
  }, [records]);

  // Build quick filter definitions
  const quickFilters: QuickFilter[] = useMemo(() => {
    const filters: QuickFilter[] = [
      {
        id: "not_found",
        label: "No encontradas",
        fn: (r) => r.status === "not_found",
        color: "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100",
      },
      {
        id: "synced",
        label: "Sincronizadas",
        fn: (r) => r.status === "synced",
        color: "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100",
      },
      {
        id: "error",
        label: "Con error",
        fn: (r) => r.status === "error" || r.status === "synced_with_error",
        color: "bg-red-50 text-red-700 border-red-300 hover:bg-red-100",
      },
      {
        id: "canceled",
        label: "Anuladas",
        fn: (r) => r.status === "canceled",
        color: "bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100",
      },
      {
        id: "supplier_not_exists",
        label: "Proveedor no existe",
        fn: (r) => r.supplierExists === false,
        color: "bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100",
      },
      {
        id: "has_sync_date",
        label: "Con Ult. Sinc",
        fn: (r) => !getLastSyncDate(r.synchronization_date, r.synchronization_date2, r.manual_date_synch).isEmpty,
        color: "bg-teal-50 text-teal-700 border-teal-300 hover:bg-teal-100",
      },
      {
        id: "no_sync_date",
        label: "Sin Ult. Sinc",
        fn: (r) => getLastSyncDate(r.synchronization_date, r.synchronization_date2, r.manual_date_synch).isEmpty,
        color: "bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100",
      },
      // Dynamic delivery_status filters
      ...deliveryStatuses.map(ds => ({
        id: `delivery_${ds}`,
        label: `Despacho: ${ds}`,
        fn: (r: OCRecord) => (r.delivery_status || r.portalData?.deliveryStatus || "").trim() === ds,
        color: "bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100",
      })),
    ];
    return filters;
  }, [deliveryStatuses]);

  const toggleQuickFilter = (id: string) => {
    setActiveQuickFilters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearAllFilters = () => {
    setActiveQuickFilters(new Set());
    setSearchTerm("");
  };

  const filteredRecords = useMemo(() => {
    let result = [...records];

    // Apply KPI filter from context
    if (activeKPIFilter) {
      result = result.filter(r => r.status === activeKPIFilter);
    }

    // Apply quick filters (OR within active filters)
    if (activeQuickFilters.size > 0) {
      const activeFilterFns = quickFilters
        .filter(f => activeQuickFilters.has(f.id))
        .map(f => f.fn);
      result = result.filter(r => activeFilterFns.some(fn => fn(r)));
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r.purchase_order_number.toLowerCase().includes(term) ||
        r.buyer_external_code.toLowerCase().includes(term) ||
        formatProviderCodes(r.provider_external_code_1, r.provider_external_code_2).toLowerCase().includes(term) ||
        (r.buyer_name || "").toLowerCase().includes(term) ||
        (r.provider_name || "").toLowerCase().includes(term) ||
        (r.statusMessage || "").toLowerCase().includes(term) ||
        (r.delivery_status || r.portalData?.deliveryStatus || "").toLowerCase().includes(term)
      );
    }

    // In step 3: selectable records first, blocked (supplier_not_exists) last.
    // In all other steps: use STATUS_SORT_PRIORITY as usual.
    result.sort((a, b) => {
      if (currentStep === 3) {
        const aBlocked = a.supplierExists === false ? 1 : 0;
        const bBlocked = b.supplierExists === false ? 1 : 0;
        if (aBlocked !== bBlocked) return aBlocked - bBlocked;
      } else {
        const aPri = STATUS_SORT_PRIORITY[a.status || "pending"] ?? 4;
        const bPri = STATUS_SORT_PRIORITY[b.status || "pending"] ?? 4;
        if (aPri !== bPri) return aPri - bPri;
      }
      const aVal = String(a[sortField] || "");
      const bVal = String(b[sortField] || "");
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    return result;
  }, [records, searchTerm, activeKPIFilter, activeQuickFilters, quickFilters, sortField, sortDir, currentStep]);

  const paginatedRecords = useMemo(() => {
    return filteredRecords.slice(page * pageSize, (page + 1) * pageSize);
  }, [filteredRecords, page, pageSize]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize);

  if (records.length === 0) return null;
  if (currentStep < 2) return null;

  const allFilteredSelected = filteredRecords.length > 0 && filteredRecords.every(r => selectedRecords.has(r.id));

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
      deselectAll();
    } else {
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

  // Show date column from step 3+ (during and after verification)
  const showDateColumn = currentStep >= 3;
  // Show despacho column from step 3+
  const showDespachoColumn = currentStep >= 3;
  // In step 6 (Finalizado), hide checkboxes
  const showCheckboxes = currentStep !== 6;
  const hasActiveFilters = activeQuickFilters.size > 0 || searchTerm.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="bg-card rounded-xl border shadow-sm overflow-hidden"
    >
      {/* Toolbar */}
      <div className="p-3 border-b space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por OC, comprador, proveedor, despacho..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={`h-9 gap-1.5 text-xs ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : ""}`}
              onClick={() => setShowFilters(v => !v)}
            >
              <Filter className="w-3.5 h-3.5" />
              Filtros
              {activeQuickFilters.size > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                  {activeQuickFilters.size}
                </span>
              )}
            </Button>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={clearAllFilters}
              >
                <X className="w-3.5 h-3.5" />
                Limpiar
              </Button>
            )}
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {filteredRecords.length} de {records.length} registros
              {selectedRecords.size > 0 && ` · ${selectedRecords.size} sel.`}
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

        {/* Quick Filters Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-2 pb-1 border-t border-border/50">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Filtros rápidos — clic para activar (se combinan con OR)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {quickFilters.map(f => {
                    const isActive = activeQuickFilters.has(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggleQuickFilter(f.id)}
                        className={`
                          inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all
                          ${isActive
                            ? `${f.color} ring-2 ring-offset-1 ring-current`
                            : `${f.color} opacity-60 hover:opacity-100`
                          }
                        `}
                      >
                        {isActive && <CheckCircle2 className="w-3 h-3" />}
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active filter chips */}
        {activeQuickFilters.size > 0 && !showFilters && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quickFilters.filter(f => activeQuickFilters.has(f.id)).map(f => (
              <span
                key={f.id}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${f.color}`}
              >
                {f.label}
                <button onClick={() => toggleQuickFilter(f.id)} className="ml-0.5 hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
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
              {showDespachoColumn && (
                <th className="p-3">
                  <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Truck className="w-3.5 h-3.5" />
                    Despacho
                  </div>
                </th>
              )}
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
                const lastSyncResult = getLastSyncDate(record.synchronization_date, record.synchronization_date2, record.manual_date_synch);
                const lastSyncDate = lastSyncResult.text;
                const supplierNotExists = record.supplierExists === false;
                const deliveryStatus = record.delivery_status || record.portalData?.deliveryStatus;
                const deliveryBadge = getDeliveryBadge(deliveryStatus);

                // In step 3: show a separator row before the first blocked record
                const prevRecord = idx > 0 ? paginatedRecords[idx - 1] : null;
                const showBlockedSeparator =
                  currentStep === 3 &&
                  supplierNotExists &&
                  (prevRecord === null || prevRecord.supplierExists !== false);

                return (
                  <>
                    {/* Separator before first blocked record in step 3 */}
                    {showBlockedSeparator && (
                      <tr key={`sep-${record.id}`}>
                        <td
                          colSpan={99}
                          className="px-3 py-1.5 bg-muted/40 border-y border-border/60"
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <UserX className="w-3 h-3" />
                            Proveedores no registrados — no se pueden seleccionar
                          </span>
                        </td>
                      </tr>
                    )}
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
                    {showDespachoColumn && (
                      <td className="p-3">
                        {deliveryStatus ? (
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium whitespace-nowrap ${deliveryBadge.className}`}
                          >
                            {deliveryBadge.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                    )}
                    {showDateColumn && (
                      <td className="p-3">
                        <div className="space-y-1">
                          {/* Fecha del documento */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground/60 uppercase shrink-0 w-8">Doc</span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {docDate || <span className="text-muted-foreground/30 italic">Sin dato</span>}
                            </span>
                          </div>
                          {/* Última sincronización */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase shrink-0 w-8">Sinc</span>
                            <span className={`text-xs font-mono ${
                              lastSyncResult.isEmpty
                                ? "text-muted-foreground/30 italic"
                                : "text-emerald-600 font-medium"
                            }`}>
                              {lastSyncDate || <span className="text-muted-foreground/30 italic">Sin dato</span>}
                            </span>
                          </div>
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
                  </>
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
