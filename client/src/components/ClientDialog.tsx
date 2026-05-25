import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClientById, createClient, updateClient, testClientConnection } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { TestConnectionDebugDialog } from "./TestConnectionDebugDialog";

interface ClientDialogProps {
  open: boolean;
  onClose: (success: boolean) => void;
  clientId: number | null;
}

export default function ClientDialog({ open, onClose, clientId }: ClientDialogProps) {
  const [formData, setFormData] = useState({
    clientKey: "",
    name: "",
    baseUrl: "",
    userName: "",
    password: "",
    clientId: "",
    clientSecret: "",
    primaryColor: "#10b981",
    syncRules: "",
    batchSize: 10,
    batchDelaySeconds: 3,
    isActive: false,
  });

  const { data: existingClient, isLoading: loadingClient } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClientById(clientId!),
    enabled: !!clientId && open,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [showDebugDialog, setShowDebugDialog] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);

  useEffect(() => {
    if (existingClient) {
      setFormData({
        clientKey: existingClient.clientKey,
        name: existingClient.name,
        baseUrl: existingClient.baseUrl,
        userName: existingClient.userName,
        password: existingClient.password,
        clientId: existingClient.clientId,
        clientSecret: existingClient.clientSecret,
        primaryColor: existingClient.primaryColor,
        syncRules: existingClient.syncRules || "",
        batchSize: existingClient.batchSize ?? 10,
        batchDelaySeconds: existingClient.batchDelaySeconds ?? 3,
        isActive: existingClient.isActive,
      });
    } else if (!clientId) {
      setFormData({
        clientKey: "",
        name: "",
        baseUrl: "",
        userName: "",
        password: "",
        clientId: "",
        clientSecret: "",
        primaryColor: "#10b981",
        syncRules: "",
        batchSize: 10,
        batchDelaySeconds: 3,
        isActive: false,
      });
    }
  }, [existingClient, clientId, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (clientId) {
        await updateClient(clientId, formData);
        toast.success("Cliente actualizado correctamente", { position: "bottom-left" });
      } else {
        await createClient(formData);
        toast.success("Cliente creado correctamente", { position: "bottom-left" });
      }
      onClose(true);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Error al guardar cliente", { position: "bottom-left" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: string, value: string | boolean | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (["baseUrl", "userName", "password", "clientId", "clientSecret"].includes(field)) {
      setConnectionTested(false);
    }
  };

  const handleTestConnection = async () => {
    if (!clientId) {
      toast.error("Guarde el cliente primero para habilitar la prueba de conexión", { position: "bottom-left" });
      return;
    }
    if (!formData.baseUrl || !formData.userName || !formData.password || !formData.clientId || !formData.clientSecret) {
      toast.error("Complete todos los campos de conexión antes de probar", { position: "bottom-left" });
      return;
    }

    setTestingConnection(true);
    try {
      const result = await testClientConnection(formData.clientKey);
      if (result.success) {
        toast.success("Conexión exitosa", { position: "bottom-left" });
        setConnectionTested(true);
        setTestSuccess(true);
      } else {
        toast.error(result.error || "Error de conexión", { position: "bottom-left" });
        setConnectionTested(false);
        setTestSuccess(false);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Error al probar conexión", { position: "bottom-left" });
      setConnectionTested(false);
      setTestSuccess(false);
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {clientId ? "Editar Cliente" : "Nuevo Cliente"}
          </DialogTitle>
        </DialogHeader>

        {loadingClient && clientId ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="clientKey">Llave de Cliente (Client Key) *</Label>
                <Input
                  id="clientKey"
                  value={formData.clientKey}
                  onChange={(e) => handleChange("clientKey", e.target.value)}
                  placeholder="manuelita"
                  pattern="[a-zA-Z0-9_-]+"
                  title="Solo letras, números, guiones y guiones bajos"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Identificador único para acceso por URL (ej: ?clientKey=manuelita)
                </p>
              </div>

              <div className="col-span-2">
                <Label htmlFor="name">Nombre del Cliente *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="Ej: Manuelita"
                  required
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="baseUrl">Dominio Base del Servicio *</Label>
                <Input
                  id="baseUrl"
                  type="url"
                  value={formData.baseUrl}
                  onChange={(e) => handleChange("baseUrl", e.target.value)}
                  placeholder="https://egixia.net/ProveedoresManuelita"
                  required
                />
              </div>

              <div>
                <Label htmlFor="userName">Usuario *</Label>
                <Input
                  id="userName"
                  value={formData.userName}
                  onChange={(e) => handleChange("userName", e.target.value)}
                  placeholder="apimanager.manuelita"
                  required
                />
              </div>

              <div>
                <Label htmlFor="password">Contraseña *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleChange("password", e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div>
                <Label htmlFor="clientIdField">Client ID *</Label>
                <Input
                  id="clientIdField"
                  value={formData.clientId}
                  onChange={(e) => handleChange("clientId", e.target.value)}
                  placeholder="a4559cf615a14a20..."
                  required
                />
              </div>

              <div>
                <Label htmlFor="clientSecret">Client Secret *</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  value={formData.clientSecret}
                  onChange={(e) => handleChange("clientSecret", e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div>
                <Label htmlFor="primaryColor">Color Primario *</Label>
                <div className="flex gap-2">
                  <Input
                    id="primaryColor"
                    type="color"
                    value={formData.primaryColor}
                    onChange={(e) => handleChange("primaryColor", e.target.value)}
                    className="w-20 h-10"
                  />
                  <Input
                    type="text"
                    value={formData.primaryColor}
                    onChange={(e) => handleChange("primaryColor", e.target.value)}
                    placeholder="#10b981"
                    pattern="^#[0-9A-Fa-f]{6}$"
                    className="flex-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="batchSize">Tamaño de Lote *</Label>
                <Input
                  id="batchSize"
                  type="number"
                  min={1}
                  max={100}
                  value={formData.batchSize}
                  onChange={(e) => handleChange("batchSize", Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Cantidad de peticiones por lote (1-100)
                </p>
              </div>

              <div>
                <Label htmlFor="batchDelaySeconds">Espera entre Lotes (seg) *</Label>
                <Input
                  id="batchDelaySeconds"
                  type="number"
                  min={1}
                  max={60}
                  value={formData.batchDelaySeconds}
                  onChange={(e) => handleChange("batchDelaySeconds", Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Segundos de espera entre lotes (1-60)
                </p>
              </div>

              <div className="col-span-2">
                <Label htmlFor="syncRules">Reglas de Sincronización (opcional)</Label>
                <textarea
                  id="syncRules"
                  value={formData.syncRules}
                  onChange={(e) => handleChange("syncRules", e.target.value)}
                  placeholder="Ej: Solo sincronizar OCs con estado 'Aprobado'. Verificar que el proveedor tenga RUT válido."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Estas reglas se mostrarán al usuario cuando haya órdenes no sincronizadas
                </p>
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => handleChange("isActive", e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="isActive" className="cursor-pointer">
                  Activar este cliente
                </Label>
              </div>
            </div>

            <div className="flex justify-between items-center gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testingConnection || !clientId}
                className={connectionTested ? "border-green-500 text-green-700" : ""}
                title={!clientId ? "Guarde el cliente primero para habilitar esta opción" : undefined}
              >
                {testingConnection ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wifi className="w-4 h-4 mr-2" />
                )}
                {connectionTested ? "Conexión OK" : "Probar Conexión"}
              </Button>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onClose(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {clientId ? "Actualizar" : "Crear"}
                </Button>
              </div>
            </div>
          </form>
        )}

        <TestConnectionDebugDialog
          open={showDebugDialog}
          onOpenChange={setShowDebugDialog}
          debug={null}
          success={testSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
