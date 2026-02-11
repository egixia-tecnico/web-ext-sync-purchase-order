/**
 * ResultsTable - Tabla de resultados de verificación con selección múltiple
 * Design: "Operational Clarity" - filas con borde lateral por estado
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOCSync, type OCRecord } from "@/contexts/OCSyncContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  UserX, AlertTriangle, Clock, Loader2, AlertOctagon, Info
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
    label: "Proveedor no existe",
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "#ef4444",
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

export default function ResultsTable() {
  const { records, selectedRecords, toggleSelection, selectAll, deselectAll } = useOCSync();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<keyof OCRecord>("purchase_order_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const filteredRecords = useMemo(() => {
    let result = [...records];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r.purchase_order_number.toLowerCase().includes(term) ||
        r.buyer_external_code.toLowerCase().includes(term) ||
        r.provider_external_code.toLowerCase().includes(term) ||
        (r.buyer_name || "").toLowerCase().includes(term) ||
        (r.provider_name || "").toLowerCase().includes(term) ||
        (r.statusMessage || "").toLowerCase().includes(term)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter(r => r.status === statusFilter);
    }

    result.sort((a, b) => {
      const aVal = String(a[sortField] || "");
      const bVal = String(b[sortField] || "");
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    return result;
  }, [records, searchTerm, statusFilter, sortField, sortDir]);

  const paginatedRecords = useMemo(() => {
    return filteredRecords.slice(page * pageSize, (page + 1) * pageSize);
  }, [filteredRecords, page]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize);

  if (records.length === 0) return null;

  const allSelected = records.length > 0 && selectedRecords.size === records.length;
  const someSelected = selectedRecords.size > 0 && selectedRecords.size < records.length;

  const handleSort = (field: keyof OCRecord) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: keyof OCRecord }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

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
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px] h-9 text-sm">
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="synced">Sincronizadas</SelectItem>
            <SelectItem value="not_found">No encontradas</SelectItem>
            <SelectItem value="supplier_not_exists">Proveedor no existe</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="synced_with_error">Sync con error</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="checking">Verificando</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filteredRecords.length} de {records.length} registros
          {selectedRecords.size > 0 && ` · ${selectedRecords.size} seleccionados`}
        </span>
      </div>

      {/* Table */}
      <ScrollArea className="max-h-[500px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm z-10">
            <tr className="text-left">
              <th className="p-3 w-10">
                <Checkbox
                  checked={allSelected}
                  // @ts-ignore
                  indeterminate={someSelected}
                  onCheckedChange={() => allSelected ? deselectAll() : selectAll()}
                />
              </th>
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
              <th className="p-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("provider_external_code")}>
                <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Proveedor <SortIcon field="provider_external_code" />
                </div>
              </th>
              <th className="p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Estado
                </div>
              </th>
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

                return (
                  <motion.tr
                    key={record.id}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, delay: idx * 0.01 }}
                    className={`
                      border-b border-border/50 hover:bg-muted/30 transition-colors
                      ${isSelected ? "bg-primary/5" : ""}
                    `}
                    style={{ borderLeft: `3px solid ${config.borderColor}` }}
                  >
                    <td className="p-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(record.id)}
                      />
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-xs font-medium">{record.purchase_order_number}</span>
                    </td>
                    <td className="p-3">
                      <div>
                        <span className="font-mono text-xs">{record.buyer_external_code}</span>
                        {record.buyer_name && (
                          <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{record.buyer_name}</p>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div>
                        <span className="font-mono text-xs">{record.provider_external_code || "—"}</span>
                        {record.provider_name && (
                          <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{record.provider_name}</p>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${config.color} ${config.bgColor}`}>
                        {config.icon}
                        <span className="hidden sm:inline">{config.label}</span>
                      </span>
                    </td>
                    <td className="p-3 hidden lg:table-cell">
                      {record.statusMessage ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground truncate max-w-[300px] block cursor-help">
                              {record.statusMessage}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-sm">
                            <p className="text-xs">{record.statusMessage}</p>
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
      </ScrollArea>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-3 border-t flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Página {page + 1} de {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="h-7 text-xs"
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="h-7 text-xs"
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
