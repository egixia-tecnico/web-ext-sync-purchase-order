import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { getIntegrationLogs } from "@/lib/api";
import { useClientKey } from "@/contexts/ClientKeyContext";
import { Loader2, Copy, CheckCircle2, XCircle, Clock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState, useMemo } from "react";

interface IntegrationLog {
  id: number;
  status: string;
  url: string;
  created_at: string;
  auth_prefix: string | null;
  token: string | null;
  request_body: string | null;
  response_body: string | null;
  error_detail: string | null;
  service_name: string | null;
}

interface IntegrationLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function IntegrationLogsDialog({ open, onOpenChange }: IntegrationLogsDialogProps) {
  const { clientKey } = useClientKey();
  const { data, isLoading } = useQuery({
    queryKey: ["integrationLogsDialog", clientKey],
    queryFn: () => getIntegrationLogs(clientKey || "", { limit: 20 }),
    enabled: !!clientKey && open,
  });

  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const rawLogs = (data?.logs || []) as IntegrationLog[];

  const filteredLogs = useMemo(() => {
    if (!searchTerm.trim()) return rawLogs;
    const term = searchTerm.toLowerCase();
    return rawLogs.filter(
      (log) =>
        log.url.toLowerCase().includes(term) ||
        log.request_body?.toLowerCase().includes(term) ||
        log.response_body?.toLowerCase().includes(term) ||
        log.error_detail?.toLowerCase().includes(term) ||
        log.service_name?.toLowerCase().includes(term)
    );
  }, [rawLogs, searchTerm]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`, { position: "bottom-left" });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case "error": return <XCircle className="w-4 h-4 text-red-600" />;
      case "timeout": return <Clock className="w-4 h-4 text-orange-600" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const base = "px-2 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1";
    switch (status) {
      case "success": return <span className={`${base} bg-green-100 text-green-700`}>{getStatusIcon(status)} Éxito</span>;
      case "error": return <span className={`${base} bg-red-100 text-red-700`}>{getStatusIcon(status)} Error</span>;
      case "timeout": return <span className={`${base} bg-orange-100 text-orange-700`}>{getStatusIcon(status)} Timeout</span>;
      default: return <span className={`${base} bg-gray-100 text-gray-700`}>{status}</span>;
    }
  };

  const safeParseJson = (str: string | null | undefined) => {
    if (!str) return null;
    try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Log de Integraciones</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Últimas 20 peticiones a la API de Egixia (excluyendo solicitudes de token)
          </p>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar en URL, body petición/respuesta, error, servicio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && filteredLogs.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {searchTerm.trim() ? "No se encontraron logs que coincidan con la búsqueda" : "No hay logs de integraciones disponibles"}
          </div>
        )}

        {!isLoading && filteredLogs.length > 0 && (
          <div className="space-y-3">
            {filteredLogs.map((log) => (
              <div key={log.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(log.status)}
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString("es-CO", {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded flex-1 break-all">
                        {log.url}
                      </code>
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(log.url, "URL")} className="shrink-0">
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
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-muted-foreground">Token</span>
                        {log.token && (
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(log.token || "", "Token")}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                      <code className="text-xs bg-muted px-2 py-1 rounded block break-all">
                        {log.auth_prefix} {log.token || "N/A"}
                      </code>
                    </div>

                    {log.request_body && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-muted-foreground">Body / Parámetros</span>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(log.request_body || "", "Body")}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <pre className="text-xs bg-muted px-3 py-2 rounded overflow-auto max-h-40">
                          {safeParseJson(log.request_body)}
                        </pre>
                      </div>
                    )}

                    {log.response_body && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-muted-foreground">Respuesta</span>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(log.response_body || "", "Respuesta")}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <pre className="text-xs bg-muted px-3 py-2 rounded overflow-auto max-h-40">
                          {safeParseJson(log.response_body)}
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
