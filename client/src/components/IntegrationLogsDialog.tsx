/**
 * IntegrationLogsDialog - Muestra los últimos 20 logs de integraciones
 * Accesible desde el menú de configuración (engranaje)
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useClientKey } from "@/contexts/ClientKeyContext";
import { Loader2, Copy, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

interface IntegrationLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function IntegrationLogsDialog({ open, onOpenChange }: IntegrationLogsDialogProps) {
  const { clientKey } = useClientKey();
  const { data: logs, isLoading } = trpc.logs.getIntegrationLogs.useQuery(
    { clientKey: clientKey || "" },
    { enabled: !!clientKey && open }
  );

  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`, { position: "top-center" });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "timeout":
        return <Clock className="w-4 h-4 text-orange-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1";
    switch (status) {
      case "success":
        return <span className={`${baseClasses} bg-green-100 text-green-700`}>{getStatusIcon(status)} Éxito</span>;
      case "error":
        return <span className={`${baseClasses} bg-red-100 text-red-700`}>{getStatusIcon(status)} Error</span>;
      case "timeout":
        return <span className={`${baseClasses} bg-orange-100 text-orange-700`}>{getStatusIcon(status)} Timeout</span>;
      default:
        return <span className={`${baseClasses} bg-gray-100 text-gray-700`}>{status}</span>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Log de Integraciones</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Últimas 20 peticiones a la API de Egixia (excluyendo solicitudes de token)
          </p>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && (!logs || logs.length === 0) && (
          <div className="text-center py-12 text-muted-foreground">
            No hay logs de integraciones disponibles
          </div>
        )}

        {!isLoading && logs && logs.length > 0 && (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(log.status)}
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("es-CO", {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded flex-1 break-all">
                        {log.url}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(log.url, "URL")}
                        className="shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                  >
                    {expandedRow === log.id ? "Ocultar" : "Ver detalles"}
                  </Button>
                </div>

                {expandedRow === log.id && (
                  <div className="space-y-3 pt-3 border-t">
                    {/* Token */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-muted-foreground">Token</span>
                        {log.token && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(log.token || "", "Token")}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                      <code className="text-xs bg-muted px-2 py-1 rounded block break-all">
                        {log.authPrefix} {log.token || "N/A"}
                      </code>
                    </div>

                    {/* Request Body */}
                    {log.requestBody && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-muted-foreground">Body / Parámetros</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(log.requestBody || "", "Body")}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <pre className="text-xs bg-muted px-3 py-2 rounded overflow-auto max-h-40">
                          {JSON.stringify(JSON.parse(log.requestBody), null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Response Body */}
                    {log.responseBody && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-muted-foreground">Respuesta</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(log.responseBody || "", "Respuesta")}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <pre className="text-xs bg-muted px-3 py-2 rounded overflow-auto max-h-40">
                          {JSON.stringify(JSON.parse(log.responseBody), null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
