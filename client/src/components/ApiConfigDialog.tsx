/**
 * ApiConfigDialog - Configuración de conexión a la API de Egixia
 * 
 * - Los campos se muestran en BLANCO al abrir (no precargados con credenciales)
 * - Credenciales enmascaradas: password y clientSecret tipo password
 * - Dominio base intercambiable
 * - Al guardar, se persisten las credenciales en la base de datos del servidor
 * - Token se obtiene dinámicamente vía gettoken server-side
 */
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOCSync } from "@/contexts/OCSyncContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle, Server, Globe, Key, Eye, EyeOff } from "lucide-react";

interface ApiConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ApiConfigDialog({ open, onOpenChange }: ApiConfigDialogProps) {
  const { connectionStatus, setConnectionStatus, connectionError, setConnectionError } = useOCSync();
  
  // Campos siempre en blanco al abrir - NO precargados
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const configQuery = trpc.egixia.getConfig.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: false,
  });

  const saveConfigMutation = trpc.egixia.saveConfig.useMutation();

  // Reset campos a blanco cada vez que se abre el diálogo
  useEffect(() => {
    if (open) {
      setBaseUrl("");
      setUsername("");
      setPassword("");
      setClientId("");
      setClientSecret("");
      setShowPassword(false);
      setShowSecret(false);
    }
  }, [open]);

  const handleConnect = async () => {
    if (!baseUrl) {
      toast.error("Ingrese la URL base del dominio de integración", { position: "top-center" });
      return;
    }
    if (!username || !password || !clientId || !clientSecret) {
      toast.error("Complete todos los campos de autenticación", { position: "top-center" });
      return;
    }

    setIsConnecting(true);
    try {
      const result = await saveConfigMutation.mutateAsync({
        baseUrl: baseUrl.replace(/\/$/, ""),
        userName: username,
        password,
        clientId,
        clientSecret,
      });

      if (result.success) {
        toast.success("Conexión exitosa. Credenciales almacenadas en el servidor.", { position: "top-center" });
        setConnectionStatus("connected");
        setConnectionError(null);
        configQuery.refetch();
        onOpenChange(false);
      } else {
        toast.error(result.message || "Error de conexión", { position: "top-center" });
      }
    } catch (err: any) {
      toast.error(`Error: ${err?.message || "desconocido"}`, { position: "top-center" });
    } finally {
      setIsConnecting(false);
    }
  };

  const isConnected = connectionStatus === "connected";

  // Enmascarar datos del config actual
  const maskedBaseUrl = configQuery.data?.baseUrl
    ? configQuery.data.baseUrl.replace(/^(https?:\/\/[^/]+)(.*)$/, "$1/***")
    : "No configurada";

  const maskedUser = configQuery.data?.userName
    ? configQuery.data.userName.substring(0, 3) + "***"
    : "No configurado";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            Configuración de Conexión
          </DialogTitle>
          <DialogDescription>
            Configure la conexión a la API del portal de proveedores. Las credenciales se almacenan de forma segura en el servidor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Connection status */}
          {isConnected && configQuery.data?.configured && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <div className="flex-1">
                <span className="font-medium">Conectado al portal</span>
                <div className="text-xs text-emerald-600 mt-0.5 font-mono">
                  {maskedBaseUrl} · {maskedUser}
                </div>
              </div>
            </div>
          )}

          {connectionStatus === "error" && connectionError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <div className="flex-1">
                <span className="font-medium">Error de conexión</span>
                <p className="text-xs text-red-600 mt-0.5">{connectionError}</p>
              </div>
            </div>
          )}

          {/* Dominio base */}
          <div className="space-y-2">
            <Label htmlFor="baseUrl" className="text-sm font-medium flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              Dominio Base de Integración
            </Label>
            <Input
              id="baseUrl"
              placeholder="https://egixia.net/ProveedoresManuelita"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              URL base del portal. Ej: https://egixia.net/ProveedoresManuelita
            </p>
          </div>

          {/* Credenciales */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <Key className="w-4 h-4" />
              Credenciales de Autenticación
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Usuario</Label>
                <Input
                  placeholder="Ingrese el usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="text-sm"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contraseña</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Ingrese la contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="text-sm pr-9"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Client ID</Label>
                <Input
                  placeholder="Ingrese el Client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Client Secret</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    placeholder="Ingrese el Client Secret"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className="font-mono text-xs pr-9"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full mt-4"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Conectando...
                </>
              ) : (
                "Probar conexión y guardar"
              )}
            </Button>
          </div>

          {/* Info */}
          <p className="text-[11px] text-muted-foreground/70 text-center pt-1">
            Las credenciales se almacenan en el servidor. El token se renueva automáticamente.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
