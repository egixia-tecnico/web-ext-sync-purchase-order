/**
 * ClientKeyInvalid - Pantalla de error cuando el clientKey no coincide con ningún cliente
 * Muestra mensaje específico indicando que el valor no coincide con la parametrización
 */
import { AlertTriangle, Key, RefreshCw, Shield } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ClientKeyInvalidProps {
  clientKey: string;
}

export default function ClientKeyInvalid({ clientKey }: ClientKeyInvalidProps) {
  const currentUrl = window.location.origin + window.location.pathname;

  const handleRetry = () => {
    // Clear sessionStorage and reload
    sessionStorage.removeItem("clientKey");
    window.location.href = currentUrl;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="max-w-2xl w-full p-8 shadow-xl">
        <div className="flex flex-col items-center text-center space-y-6">
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-12 h-12 text-amber-600" />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-slate-900">
              Identificador No Válido
            </h1>
            <p className="text-lg text-slate-600">
              El valor ingresado no coincide con la parametrización.
            </p>
          </div>

          {/* Client Key Display */}
          <div className="w-full bg-amber-50 border border-amber-200 rounded-lg p-6 text-left space-y-4">
            <div className="flex items-start gap-3">
              <Key className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="space-y-2 flex-1">
                <h3 className="font-semibold text-slate-900">ClientKey recibido:</h3>
                <div className="bg-white border border-amber-300 rounded p-3 font-mono text-sm text-amber-700 break-all">
                  {clientKey}
                </div>
                <p className="text-sm text-slate-600">
                  Este identificador no está registrado en el sistema. Verifique que el <strong>clientKey</strong> sea correcto
                  o contacte al administrador para obtener el identificador válido.
                </p>
              </div>
            </div>

            <div className="border-t border-amber-200 pt-4">
              <h3 className="font-semibold text-slate-900 mb-2">Nota importante:</h3>
              <p className="text-sm text-slate-600">
                El <strong>clientKey</strong> debe coincidir exactamente con el valor parametrizado en el sistema.
                La única diferencia permitida es en mayúsculas y minúsculas (ej: <code className="px-1.5 py-0.5 bg-white rounded border text-xs">ABC123</code> es equivalente a <code className="px-1.5 py-0.5 bg-white rounded border text-xs">abc123</code>).
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleRetry}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Intentar con otro clientKey
            </Button>
            <Button
              className="flex-1 bg-amber-600 hover:bg-amber-700"
              onClick={() => window.location.href = "mailto:soporte@egixia.com?subject=Solicitud de clientKey válido"}
            >
              Solicitar Soporte
            </Button>
          </div>
          
          {/* Admin Access */}
          <div className="w-full border-t border-slate-200 pt-6">
            <Link href="/admin/login">
              <Button variant="ghost" className="w-full" size="sm">
                <Shield className="w-4 h-4 mr-2" />
                Acceso Administrador @egixia.com
              </Button>
            </Link>
          </div>

          {/* Footer note */}
          <p className="text-xs text-slate-500 mt-4">
            Si cree que este es un error, contacte al administrador del sistema con el clientKey mostrado arriba.
          </p>
        </div>
      </Card>
    </div>
  );
}
