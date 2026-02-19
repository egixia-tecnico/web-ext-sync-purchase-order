import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface DebugInfo {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: Record<string, string>;
  responseStatus?: number;
  responseData?: any;
  errorMessage?: string;
}

interface TestConnectionDebugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debug?: DebugInfo;
  success: boolean;
}

export function TestConnectionDebugDialog({
  open,
  onOpenChange,
  debug,
  success,
}: TestConnectionDebugDialogProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  if (!debug) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Detalles de Prueba de Conexión{" "}
            <span className={success ? "text-green-600" : "text-red-600"}>
              {success ? "✓ Exitosa" : "✗ Fallida"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Método y URL */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Solicitud HTTP</h3>
            <div className="bg-muted p-3 rounded-lg space-y-2 font-mono text-sm">
              <div>
                <span className="font-bold text-blue-600">{debug.method}</span>{" "}
                {debug.url}
              </div>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">URL Completa:</div>
                  <div className="break-all text-xs">{debug.url}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(debug.url, "url")}
                  className="ml-2"
                >
                  {copiedSection === "url" ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Headers */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Headers</h3>
            <div className="bg-muted p-3 rounded-lg font-mono text-sm space-y-1">
              {Object.entries(debug.requestHeaders).map(([key, value]) => (
                <div key={key}>
                  <span className="text-purple-600">{key}:</span> {value}
                </div>
              ))}
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(debug.requestHeaders, null, 2),
                      "headers"
                    )
                  }
                >
                  {copiedSection === "headers" ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Request Body */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Body (JSON)</h3>
            <div className="bg-muted p-3 rounded-lg font-mono text-sm space-y-1">
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(debug.requestBody, null, 2)}
              </pre>
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(debug.requestBody, null, 2),
                      "body"
                    )
                  }
                >
                  {copiedSection === "body" ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Response */}
          {debug.responseStatus !== undefined && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">
                Respuesta (Status: {debug.responseStatus})
              </h3>
              <div className="bg-muted p-3 rounded-lg font-mono text-sm space-y-1">
                {debug.responseData ? (
                  <>
                    <pre className="whitespace-pre-wrap break-words">
                      {JSON.stringify(debug.responseData, null, 2)}
                    </pre>
                    <div className="flex justify-end mt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          copyToClipboard(
                            JSON.stringify(debug.responseData, null, 2),
                            "response"
                          )
                        }
                      >
                        {copiedSection === "response" ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">
                    {debug.errorMessage || "Sin datos de respuesta"}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {debug.errorMessage && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm text-red-600">Error</h3>
              <div className="bg-red-50 p-3 rounded-lg text-sm text-red-800">
                {debug.errorMessage}
              </div>
            </div>
          )}

          {/* Instrucciones para Postman */}
          <div className="bg-blue-50 p-3 rounded-lg text-sm space-y-2">
            <h4 className="font-semibold text-blue-900">
              Probar en Postman/SoapUI:
            </h4>
            <ol className="list-decimal list-inside space-y-1 text-blue-800">
              <li>Crear nueva solicitud POST</li>
              <li>URL: {debug.url}</li>
              <li>Headers: Content-Type: application/json</li>
              <li>Body (JSON): Copiar desde la sección Body arriba</li>
              <li>Enviar solicitud</li>
            </ol>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
