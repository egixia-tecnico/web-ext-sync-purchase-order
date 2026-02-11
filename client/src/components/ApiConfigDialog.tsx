/**
 * ApiConfigDialog - Configuración de conexión a la API de Egixia
 */
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOCSync } from "@/contexts/OCSyncContext";
import { egixiaApi } from "@/lib/egixia-api";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle, Server, Key } from "lucide-react";

interface ApiConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ApiConfigDialog({ open, onOpenChange }: ApiConfigDialogProps) {
  const { apiConfig, setApiConfig } = useOCSync();
  const [baseUrl, setBaseUrl] = useState(apiConfig.baseUrl);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [token, setToken] = useState(apiConfig.token);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(!!apiConfig.token);

  useEffect(() => {
    if (open) {
      setBaseUrl(apiConfig.baseUrl);
      setToken(apiConfig.token);
      setIsConnected(!!apiConfig.token);
    }
  }, [open, apiConfig]);

  const handleConnect = async () => {
    if (!baseUrl) {
      toast.error("Ingrese la URL base de la API");
      return;
    }

    // If token provided directly, use it
    if (token && !username) {
      setApiConfig({ baseUrl, token });
      setIsConnected(true);
      toast.success("Conexión configurada con token directo");
      return;
    }

    if (!username || !password || !clientId || !clientSecret) {
      toast.error("Complete todos los campos de autenticación");
      return;
    }

    setIsConnecting(true);
    try {
      egixiaApi.configure(baseUrl, "");
      const result = await egixiaApi.login({
        UserName: username,
        Password: password,
        ClientId: clientId,
        ClientSecret: clientSecret,
      });

      if (result.AccessToken) {
        setToken(result.AccessToken);
        setApiConfig({ baseUrl, token: result.AccessToken });
        setIsConnected(true);
        toast.success("Conexión exitosa con la API de Egixia");
      } else {
        toast.error("No se recibió token de acceso");
      }
    } catch (err: any) {
      toast.error(`Error de conexión: ${err?.message || "desconocido"}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSaveToken = () => {
    if (!baseUrl || !token) {
      toast.error("Ingrese la URL base y el token");
      return;
    }
    setApiConfig({ baseUrl, token });
    setIsConnected(true);
    toast.success("Configuración guardada");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            Configuración API Egixia
          </DialogTitle>
          <DialogDescription>
            Configure la conexión a la API del portal para verificar y sincronizar órdenes de compra.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Connection status */}
          {isConnected && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Conectado al portal</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="baseUrl" className="text-sm font-medium">URL Base de la API</Label>
            <Input
              id="baseUrl"
              placeholder="https://portal.ejemplo.com/Egixia.NetRedSocial"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Ejemplo: http://servidor/Egixia_Develop.NetRedSocial
            </p>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <Key className="w-4 h-4" />
              Opción 1: Token directo
            </p>
            <div className="space-y-2">
              <Input
                placeholder="Pegue el AccessToken aquí"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="font-mono text-xs"
              />
              <Button onClick={handleSaveToken} variant="outline" size="sm" className="w-full">
                Guardar con token
              </Button>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Opción 2: Autenticación completa</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Usuario</Label>
                <Input
                  placeholder="admin_test"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contraseña</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Client ID</Label>
                <Input
                  placeholder="a4559cf6..."
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Client Secret</Label>
                <Input
                  type="password"
                  placeholder="823e4129..."
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full mt-3"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Conectando...
                </>
              ) : (
                "Conectar y obtener token"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
