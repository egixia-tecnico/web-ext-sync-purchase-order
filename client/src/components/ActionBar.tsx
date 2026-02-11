/**
 * ActionBar - Barra de acciones para verificar, sincronizar y exportar
 * Design: "Operational Clarity" - barra flotante con acciones contextuales
 * 
 * Usa connectionStatus para validar conexión en vez de apiConfig.token
 * Verifica todos los registros seleccionados por defecto
 */
import { motion, AnimatePresence } from "framer-motion";
import { useOCSync } from "@/contexts/OCSyncContext";
import { useOCVerification } from "@/hooks/useOCVerification";
import { downloadCSV } from "@/lib/file-parser";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Search, RefreshCw, Download, CheckCheck,
  Loader2,
} from "lucide-react";

export default function ActionBar() {
  const {
    records, isProcessing, progress, connectionStatus,
    selectedRecords, selectAll, deselectAll, selectByStatus, reconnect,
  } = useOCSync();
  const { verifyBatch, syncBatch } = useOCVerification();

  if (records.length === 0) return null;

  const pendingCount = records.filter(r => r.status === "pending" || !r.status).length;
  const notFoundCount = records.filter(r => r.status === "not_found" || r.status === "provider_not_found").length;
  const selectedCount = selectedRecords.size;
  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const handleVerify = async () => {
    if (connectionStatus !== "connected") {
      toast.error("No hay conexión con la API. Intentando reconectar...");
      await reconnect();
      return;
    }

    if (selectedCount > 0) {
      const selected = records.filter(r => selectedRecords.has(r.id));
      await verifyBatch(selected);
    } else {
      await verifyBatch();
    }
    toast.success("Verificación completada");
  };

  const handleSync = async () => {
    if (connectionStatus !== "connected") {
      toast.error("No hay conexión con la API. Intentando reconectar...");
      await reconnect();
      return;
    }

    if (selectedCount > 0) {
      const selected = records.filter(r => selectedRecords.has(r.id));
      await syncBatch(selected);
    } else {
      await syncBatch();
    }
    toast.success("Sincronización completada");
  };

  const handleExport = () => {
    const toExport = selectedCount > 0
      ? records.filter(r => selectedRecords.has(r.id))
      : records;
    
    const now = new Date();
    const dateStr = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}_${String(now.getDate()).padStart(2, "0")}`;
    downloadCSV(toExport, `verificacion_oc_${dateStr}.csv`);
    toast.success(`${toExport.length} registros exportados`);
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

        {/* Sync */}
        <Button
          onClick={handleSync}
          disabled={isProcessing || (notFoundCount === 0 && selectedCount === 0)}
          variant="outline"
          className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
        >
          <RefreshCw className="w-4 h-4" />
          {selectedCount > 0
            ? `Sincronizar seleccionados (${selectedCount})`
            : `Sincronizar no encontradas (${notFoundCount})`
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
            onClick={() => selectByStatus("provider_not_found")}
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
