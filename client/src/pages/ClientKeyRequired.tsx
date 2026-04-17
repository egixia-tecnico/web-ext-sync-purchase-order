/**
 * ClientKeyRequired - Formulario de acceso cuando no se proporciona clientKey en la URL
 * Permite al usuario ingresar su key, lo valida contra la base de datos y redirige.
 */
import { useState, useRef } from "react";
import { Key, ArrowRight, Loader2, Shield, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

type ValidationState = "idle" | "loading" | "valid" | "invalid" | "inactive";

export default function ClientKeyRequired() {
  const [inputKey, setInputKey] = useState("");
  const [validationState, setValidationState] = useState<ValidationState>("idle");
  const [clientName, setClientName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Lazy query: se ejecuta solo cuando se llama manualmente
  const validateQuery = trpc.clients.getByKey.useQuery(
    { clientKey: inputKey.trim() },
    {
      enabled: false,   // No ejecutar automáticamente
      retry: false,
    }
  );

  const handleAccess = async () => {
    const key = inputKey.trim();
    if (!key) {
      inputRef.current?.focus();
      return;
    }

    setValidationState("loading");
    setClientName("");

    try {
      const result = await validateQuery.refetch();
      const client = result.data;

      if (!client) {
        setValidationState("invalid");
        return;
      }

      if (!client.isActive) {
        setValidationState("inactive");
        setClientName(client.name);
        return;
      }

      // Key válido y activo → redirigir con el key como parámetro
      setValidationState("valid");
      setClientName(client.name);

      setTimeout(() => {
        const redirectUrl = `${window.location.origin}${window.location.pathname}?clientKey=${encodeURIComponent(key)}`;
        window.location.href = redirectUrl;
      }, 800);
    } catch {
      setValidationState("invalid");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAccess();
  };

  const handleReset = () => {
    setInputKey("");
    setValidationState("idle");
    setClientName("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="max-w-md w-full p-8 shadow-xl">
        <div className="flex flex-col items-center space-y-6">

          {/* Logo / icono */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center shadow-md">
              <RefreshCw className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">OC Sync</h1>
              <p className="text-xs text-slate-500">Verificación de Órdenes de Compra</p>
            </div>
          </div>

          {/* Formulario de acceso */}
          <div className="w-full space-y-4">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-slate-800">Ingrese su identificador de empresa</h2>
              <p className="text-sm text-slate-500 mt-1">
                Ingrese el <strong>clientKey</strong> asignado a su organización para acceder.
              </p>
            </div>

            {/* Input */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Key className="w-4 h-4" />
              </div>
              <Input
                ref={inputRef}
                type="text"
                placeholder="Ej: manuelita-prod-2024"
                value={inputKey}
                onChange={(e) => {
                  setInputKey(e.target.value);
                  if (validationState !== "idle") setValidationState("idle");
                }}
                onKeyDown={handleKeyDown}
                className={`pl-9 pr-4 font-mono text-sm transition-colors ${
                  validationState === "invalid" || validationState === "inactive"
                    ? "border-red-400 focus-visible:ring-red-400"
                    : validationState === "valid"
                    ? "border-emerald-400 focus-visible:ring-emerald-400"
                    : ""
                }`}
                disabled={validationState === "loading" || validationState === "valid"}
                autoFocus
              />
            </div>

            {/* Feedback de validación */}
            {validationState === "invalid" && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>No se encontró ninguna empresa con ese identificador. Verifique e intente de nuevo.</span>
              </div>
            )}

            {validationState === "inactive" && (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  La empresa <strong>{clientName}</strong> está actualmente inactiva. Contacte al administrador.
                </span>
              </div>
            )}

            {validationState === "valid" && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  Acceso confirmado para <strong>{clientName}</strong>. Redirigiendo...
                </span>
              </div>
            )}

            {/* Botón principal */}
            {validationState !== "valid" ? (
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleAccess}
                disabled={validationState === "loading" || !inputKey.trim()}
              >
                {validationState === "loading" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Acceder
                  </>
                )}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleReset}
              >
                Usar otro identificador
              </Button>
            )}
          </div>

          {/* Separador */}
          <div className="w-full border-t border-slate-200" />

          {/* Acceso admin */}
          <div className="w-full text-center">
            <Link href="/admin/login">
              <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-700 text-xs">
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                Acceso Administrador @egixia.com
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
