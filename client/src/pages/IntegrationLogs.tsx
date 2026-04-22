/**
 * IntegrationLogs - Página completa de logs de integraciones del backend
 * Muestra datos crudos: método HTTP, URL, headers, request body, response body,
 * raw response, HTTP status code, tiempo de ejecución, servicio, error detail
 * Con filtros por estado, paginación y detalle expandible
 */
import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useClientKey } from "@/contexts/ClientKeyContext";
import { useThemeColor } from "@/contexts/ThemeColorContext";
import {
  Loader2, Copy, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight,
  Trash2, ArrowLeft, Search, Filter, RefreshCw, Globe, Timer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

const PAGE_SIZE = 25;

export default function IntegrationLogs() {
  const { clientKey } = useClientKey();
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;
  const [, navigate] = useLocation();

  // Verificar sesión admin
  const { data: adminSession, isLoading: adminLoading } = trpc.auth.checkAdminSession.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  });

  // Redirigir a login si no es admin
  useEffect(() => {
    if (!adminLoading && adminSession?.isAdmin !== true) {
      navigate(`/admin/login?returnPath=${encodeURIComponent("/logs?clientKey=" + (clientKey || ""))}`);
    }
  }, [adminLoading, adminSession, navigate, clientKey]);

  // Mostrar loading mientras verifica sesión
  if (adminLoading || adminSession?.isAdmin !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading, refetch } = trpc.logs.getIntegrationLogs.useQuery(
    {
      clientKey: clientKey || "",
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      status: statusFilter,
    },
    { enabled: !!clientKey, refetchOnWindowFocus: false }
  );

  const clearLogsMutation = trpc.logs.clearLogs.useMutation({
    onSuccess: () => {
      toast.success("Logs eliminados correctamente");
      refetch();
    },
    onError: (err) => {
      toast.error(`Error al eliminar logs: ${err.message}`);
    },
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Filter by search term (client-side on current page)
  const filteredLogs = useMemo(() => {
    if (!searchTerm.trim()) return logs;
    const term = searchTerm.toLowerCase();
    return logs.filter(
      (log) =>
        log.url.toLowerCase().includes(term) ||
        log.serviceName?.toLowerCase().includes(term) ||
        log.errorDetail?.toLowerCase().includes(term) ||
        log.requestBody?.toLowerCase().includes(term) ||
        log.responseBody?.toLowerCase().includes(term)
    );
  }, [logs, searchTerm]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`, { position: "bottom-left" });
  };

  const formatJson = (jsonStr: string | null | undefined): string => {
    if (!jsonStr) return "N/A";
    try {
      return JSON.stringify(JSON.parse(jsonStr), null, 2);
    } catch {
      return jsonStr;
    }
  };

  const getStatusBadge = (status: string) => {
    const base = "px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5";
    switch (status) {
      case "success":
        return <span className={`${base} bg-green-100 text-green-700`}><CheckCircle2 className="w-3.5 h-3.5" /> Éxito</span>;
      case "error":
        return <span className={`${base} bg-red-100 text-red-700`}><XCircle className="w-3.5 h-3.5" /> Error</span>;
      case "timeout":
        return <span className={`${base} bg-orange-100 text-orange-700`}><Clock className="w-3.5 h-3.5" /> Timeout</span>;
      default:
        return <span className={`${base} bg-gray-100 text-gray-700`}>{status}</span>;
    }
  };

  const getHttpStatusBadge = (code: number | null) => {
    if (!code) return <span className="text-xs text-muted-foreground">—</span>;
    const color = code >= 200 && code < 300 ? "text-green-700 bg-green-50" :
                  code >= 400 && code < 500 ? "text-orange-700 bg-orange-50" :
                  code >= 500 ? "text-red-700 bg-red-50" : "text-gray-700 bg-gray-50";
    return <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${color}`}>{code}</span>;
  };

  const getMethodBadge = (method: string) => {
    const color = method === "GET" ? "text-blue-700 bg-blue-50" :
                  method === "POST" ? "text-purple-700 bg-purple-50" :
                  "text-gray-700 bg-gray-50";
    return <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${color}`}>{method}</span>;
  };

  const handleClearLogs = () => {
    if (confirm("¿Está seguro de eliminar todos los logs de integración? Esta acción no se puede deshacer.")) {
      clearLogsMutation.mutate({ clientKey: clientKey || "" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href={`/?clientKey=${clientKey}`}>
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <ArrowLeft className="w-4 h-4" />
                  Volver
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-foreground flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  <Globe className="w-5 h-5" style={{ color: `rgb(${r}, ${g}, ${b})` }} />
                  Log de Integraciones
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Datos crudos del backend — {total} registros
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                Actualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearLogs}
                disabled={clearLogsMutation.isPending || total === 0}
                className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpiar logs
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="container py-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status filter tabs */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Filter className="w-3.5 h-3.5 text-muted-foreground ml-2" />
            {[
              { value: "all", label: "Todos" },
              { value: "success", label: "Éxito" },
              { value: "error", label: "Error" },
              { value: "timeout", label: "Timeout" },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => { setStatusFilter(tab.value); setPage(0); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === tab.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar en URL, servicio, error..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container pb-8">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: `rgb(${r}, ${g}, ${b})` }} />
          </div>
        )}

        {!isLoading && filteredLogs.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No hay logs de integraciones</p>
            <p className="text-xs mt-1">Los logs aparecerán aquí cuando se realicen consultas a la API</p>
          </div>
        )}

        {!isLoading && filteredLogs.length > 0 && (
          <div className="space-y-2">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`border rounded-lg transition-colors ${
                  expandedRow === log.id ? "border-border bg-card shadow-sm" : "hover:bg-muted/30"
                }`}
              >
                {/* Summary row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                >
                  {/* Status */}
                  <div className="w-20 shrink-0">
                    {getStatusBadge(log.status)}
                  </div>

                  {/* Method + HTTP Status */}
                  <div className="flex items-center gap-2 w-24 shrink-0">
                    {getMethodBadge(log.httpMethod)}
                    {getHttpStatusBadge(log.httpStatusCode)}
                  </div>

                  {/* Service name */}
                  <div className="w-48 shrink-0">
                    <span className="text-xs font-mono font-medium text-foreground truncate block">
                      {log.serviceName || "—"}
                    </span>
                  </div>

                  {/* Execution time */}
                  <div className="w-20 shrink-0 flex items-center gap-1">
                    <Timer className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-mono">
                      {log.executionTimeMs ? `${(log.executionTimeMs / 1000).toFixed(1)}s` : "—"}
                    </span>
                  </div>

                  {/* URL (truncated) */}
                  <div className="flex-1 min-w-0">
                    <code className="text-[11px] text-muted-foreground truncate block">
                      {log.url}
                    </code>
                  </div>

                  {/* Timestamp */}
                  <div className="w-36 shrink-0 text-right">
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("es-CO", {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}
                    </span>
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedRow === log.id && (
                  <div className="px-4 pb-4 space-y-4 border-t">
                    {/* Error detail banner */}
                    {log.errorDetail && (
                      <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200">
                        <div className="flex items-start gap-2">
                          <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-red-800">Detalle del Error</p>
                            <p className="text-xs text-red-700 mt-1 break-all">{log.errorDetail}</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); copyToClipboard(log.errorDetail || "", "Error"); }}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
                      {/* Left column: Request */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }} />
                          Request
                        </h4>

                        {/* URL completa */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-semibold text-muted-foreground">URL Completa</span>
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); copyToClipboard(log.url, "URL"); }}>
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                          <code className="text-[11px] bg-muted px-2 py-1.5 rounded block break-all font-mono">
                            {log.httpMethod} {log.url}
                          </code>
                        </div>

                        {/* Headers */}
                        {log.requestHeaders && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-semibold text-muted-foreground">Headers</span>
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); copyToClipboard(log.requestHeaders || "", "Headers"); }}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                            <pre className="text-[11px] bg-muted px-3 py-2 rounded overflow-auto max-h-32 font-mono">
                              {formatJson(log.requestHeaders)}
                            </pre>
                          </div>
                        )}

                        {/* Request Body */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-semibold text-muted-foreground">Body / Parámetros</span>
                            {log.requestBody && (
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); copyToClipboard(log.requestBody || "", "Body"); }}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                          <pre className="text-[11px] bg-muted px-3 py-2 rounded overflow-auto max-h-48 font-mono">
                            {log.requestBody ? formatJson(log.requestBody) : "Sin body"}
                          </pre>
                        </div>

                        {/* Token */}
                        <div>
                          <span className="text-[11px] font-semibold text-muted-foreground">Token</span>
                          <code className="text-[11px] bg-muted px-2 py-1 rounded block mt-1 font-mono">
                            {log.authPrefix} {log.token || "N/A"}
                          </code>
                        </div>
                      </div>

                      {/* Right column: Response */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${log.status === "success" ? "bg-green-500" : log.status === "error" ? "bg-red-500" : "bg-orange-500"}`} />
                          Response
                        </h4>

                        {/* HTTP Status + Time */}
                        <div className="flex items-center gap-4">
                          <div>
                            <span className="text-[11px] font-semibold text-muted-foreground block mb-1">HTTP Status</span>
                            {getHttpStatusBadge(log.httpStatusCode)}
                          </div>
                          <div>
                            <span className="text-[11px] font-semibold text-muted-foreground block mb-1">Tiempo</span>
                            <span className="text-xs font-mono">
                              {log.executionTimeMs ? `${log.executionTimeMs}ms (${(log.executionTimeMs / 1000).toFixed(2)}s)` : "—"}
                            </span>
                          </div>
                        </div>

                        {/* Response Body (parsed JSON) */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-semibold text-muted-foreground">Response Body (JSON)</span>
                            {log.responseBody && (
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); copyToClipboard(log.responseBody || "", "Response"); }}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                          <pre className="text-[11px] bg-muted px-3 py-2 rounded overflow-auto max-h-48 font-mono">
                            {log.responseBody ? formatJson(log.responseBody) : "Sin respuesta"}
                          </pre>
                        </div>

                        {/* Raw Response (when different from parsed, e.g. HTML) */}
                        {log.rawResponse && log.rawResponse !== log.responseBody && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-semibold text-muted-foreground">Raw Response (crudo)</span>
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); copyToClipboard(log.rawResponse || "", "Raw Response"); }}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                            <pre className="text-[11px] bg-red-50 border border-red-200 px-3 py-2 rounded overflow-auto max-h-48 font-mono text-red-800">
                              {log.rawResponse}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Metadata footer */}
                    <div className="flex items-center gap-4 pt-3 border-t text-[11px] text-muted-foreground">
                      <span>ID: {log.id}</span>
                      <span>Servicio: {log.serviceName || "—"}</span>
                      <span>Cliente ID: {log.clientId}</span>
                      <span>
                        {new Date(log.createdAt).toLocaleString("es-CO", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <span className="text-xs text-muted-foreground">
              Mostrando {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                Página {page + 1} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
                className="gap-1"
              >
                Siguiente
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
