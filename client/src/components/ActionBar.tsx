/**
 * ActionBar - Barra de acciones para verificar y exportar
 * Design: "Operational Clarity" - barra flotante con acciones contextuales
 */
import { motion, AnimatePresence } from "framer-motion";
import { useOCSync } from "@/contexts/OCSyncContext";
import { useOCVerification } from "@/hooks/useOCVerification";
import { downloadCSV } from "@/lib/file-parser";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Search, Download, CheckCheck,
  Loader2,
} from "lucide-react";

export default function ActionBar() {
  const {
    records, isProcessing, progress, connectionStatus,
    selectedRecords, selectAll, deselectAll, selectByStatus,
  } = useOCSync();
  const { verifyBatch } = useOCVerification();

  if (records.length === 0) return null;

  const pendingCount = records.filter(r => r.status === "pending" || !r.status).length;
  const selectedCount = selectedRecords.size;
  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const handleVerify = async () => {
    if (connectionStatus !== "connected") {
      toast.error("No hay conexión con la API. Configure las credenciales primero.", { position: "top-center" });
      return;
    }

    if (selectedCount > 0) {
      const selected = records.filter(r => selectedRecords.has(r.id));
      await verifyBatch(selected);
    } else {
      await verifyBatch();
    }
  };

  const handleExport = () => {
    const toExport = selectedCount > 0
      ? records.filter(r => selectedRecords.has(r.id))
      : records;
    
    const now = new Date();
    const dateStr = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}_${String(now.getDate()).padStart(2, "0")}`;
    downloadCSV(toExport, `verificacion_oc_${dateStr}.csv`);
    toast.success(`${toExport.length} registros exportados`, { position: "top-center" });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-card rounded-xl border shadow-sm p-4"
    >
      {/* Progress bar during processing */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                Procesando {progress.current} de {progress.total}...
              </span>
              <span className="text-xs font-mono text-muted-foreground">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Verify */}
        <Button
          onClick={handleVerify}
          disabled={isProcessing || (pendingCount === 0 && selectedCount === 0)}
          className="gap-2"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {selectedCount > 0
            ? `Verificar seleccionados (${selectedCount})`
            : `Verificar pendientes (${pendingCount})`
          }
        </Button>

        {/* Export */}
        <Button
          onClick={handleExport}
          disabled={isProcessing}
          variant="outline"
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Exportar {selectedCount > 0 ? `(${selectedCount})` : "todo"}
        </Button>

        <div className="flex-1" />

        {/* Quick selection */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={selectAll}
            className="text-xs h-7"
          >
            <CheckCheck className="w-3 h-3 mr-1" />
            Todo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => selectByStatus("not_found")}
            className="text-xs h-7 text-amber-600"
          >
            No encontradas
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => selectByStatus("supplier_not_exists")}
            className="text-xs h-7 text-red-600"
          >
            Sin proveedor
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={deselectAll}
            className="text-xs h-7"
          >
            Ninguno
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
