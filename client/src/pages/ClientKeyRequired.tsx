/**
 * ClientKeyRequired - Pantalla de error cuando no se proporciona clientKey
 * Bloquea el acceso a la aplicación hasta que se proporcione un clientKey válido
 */
import { AlertCircle, Key, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ClientKeyRequired() {
  const currentUrl = window.location.origin + window.location.pathname;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="max-w-2xl w-full p-8 shadow-xl">
        <div className="flex flex-col items-center text-center space-y-6">
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-12 h-12 text-red-600" />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-slate-900">
              Identificador de Cliente Requerido
            </h1>
            <p className="text-lg text-slate-600">
              Para acceder a esta aplicación, debe proporcionar un <code className="px-2 py-1 bg-slate-200 rounded text-sm font-mono">clientKey</code> válido en la URL.
            </p>
          </div>

          {/* Explanation */}
          <div className="w-full bg-slate-50 border border-slate-200 rounded-lg p-6 text-left space-y-4">
            <div className="flex items-start gap-3">
              <Key className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div className="space-y-2">
                <h3 className="font-semibold text-slate-900">¿Qué es el clientKey?</h3>
                <p className="text-sm text-slate-600">
                  El <strong>clientKey</strong> es un identificador único que permite a la aplicación cargar automáticamente
                  las credenciales, configuración y reglas de sincronización específicas de su organización.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h3 className="font-semibold text-slate-900 mb-2">Formato de URL correcto:</h3>
              <div className="bg-white border border-emerald-200 rounded p-3 font-mono text-sm text-emerald-700 break-all">
                {currentUrl}<span className="text-emerald-600 font-bold">?clientKey=su_identificador</span>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h3 className="font-semibold text-slate-900 mb-2">Ejemplos:</h3>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-0.5">•</span>
                  <code className="bg-white px-2 py-1 rounded border text-xs break-all">
                    {currentUrl}?clientKey=a4559cf615a14a20acbd8d6eef9d315e
                  </code>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-0.5">•</span>
                  <code className="bg-white px-2 py-1 rounded border text-xs break-all">
                    {currentUrl}?clientKey=7b3e8f2c9d1a6e4f5c8b2a9d7e3f1c6a
                  </code>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-0.5">•</span>
                  <code className="bg-white px-2 py-1 rounded border text-xs break-all">
                    {currentUrl}?clientKey=9f2e1d8c7b6a5e4f3c2d1a9b8e7f6c5a
                  </code>
                </li>
              </ul>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => window.location.href = "mailto:soporte@egixia.com?subject=Solicitud de clientKey"}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Solicitar clientKey
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => window.location.reload()}
            >
              Reintentar
            </Button>
          </div>

          {/* Footer note */}
          <p className="text-xs text-slate-500 mt-4">
            Si ya tiene un clientKey, agregue <code className="px-1.5 py-0.5 bg-slate-200 rounded">?clientKey=su_identificador</code> al final de la URL y recargue la página.
          </p>
        </div>
      </Card>
    </div>
  );
}
