/**
 * HistoryDialog - Vista de historial de verificaciones
 * Muestra un resumen de ejecuciones anteriores con métricas
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useThemeColor } from "@/contexts/ThemeColorContext";
import { useClientKey } from "@/contexts/ClientKeyContext";
import { Clock, CheckCircle2, XCircle, AlertCircle, FileText } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface HistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function HistoryDialog({ open, onOpenChange }: HistoryDialogProps) {
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;
  const { clientKey } = useClientKey();
  
  const { data: history, isLoading } = trpc.egixia.getVerificationHistory.useQuery(
    { clientKey: clientKey || undefined },
    { enabled: open }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" style={{ color: `rgb(${r}, ${g}, ${b})` }} />
            Historial de Verificaciones
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: `rgb(${r}, ${g}, ${b})` }} />
          </div>
        )}

        {!isLoading && (!history || history.length === 0) && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">No hay verificaciones registradas</p>
          </div>
        )}

        {!isLoading && history && history.length > 0 && (
          <div className="space-y-3">
            {history.map((log) => (
              <div
                key={log.id}
                className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium">
                      {format(new Date(log.createdAt), "PPP 'a las' p", { locale: es })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Duración: {log.executionTimeMs ? `${(log.executionTimeMs / 1000).toFixed(2)}s` : "N/A"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Total: {log.totalRecords} OCs
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sincronizadas</p>
                      <p className="text-sm font-semibold">{log.synced}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                      <XCircle className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">No encontradas</p>
                      <p className="text-sm font-semibold">{log.notFound}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Proveedor no existe</p>
                      <p className="text-sm font-semibold">{log.supplierNotExists}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <XCircle className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Errores</p>
                      <p className="text-sm font-semibold">{log.errors}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
