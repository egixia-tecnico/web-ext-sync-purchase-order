/**
 * ClientDialog - Diálogo para crear o editar clientes
 * Formulario completo con validación y encriptación automática
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ClientDialogProps {
  open: boolean;
  onClose: (success: boolean) => void;
  clientId: number | null;
}

export default function ClientDialog({ open, onClose, clientId }: ClientDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    baseUrl: "",
    userName: "",
    password: "",
    clientId: "",
    clientSecret: "",
    primaryColor: "#10b981",
    isActive: false,
  });

  const { data: existingClient, isLoading: loadingClient } = trpc.clients.getById.useQuery(
    { id: clientId! },
    { enabled: !!clientId && open }
  );

  const createMutation = trpc.clients.create.useMutation();
  const updateMutation = trpc.clients.update.useMutation();

  useEffect(() => {
    if (existingClient) {
      setFormData({
        name: existingClient.name,
        baseUrl: existingClient.baseUrl,
        userName: existingClient.userName,
        password: existingClient.password,
        clientId: existingClient.clientId,
        clientSecret: existingClient.clientSecret,
        primaryColor: existingClient.primaryColor,
        isActive: existingClient.isActive,
      });
    } else if (!clientId) {
      // Reset form for new client
      setFormData({
        name: "",
        baseUrl: "",
        userName: "",
        password: "",
        clientId: "",
        clientSecret: "",
        primaryColor: "#10b981",
        isActive: false,
      });
    }
  }, [existingClient, clientId, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (clientId) {
        await updateMutation.mutateAsync({ id: clientId, ...formData });
        toast.success("Cliente actualizado correctamente", { position: "top-center" });
      } else {
        await createMutation.mutateAsync(formData);
        toast.success("Cliente creado correctamente", { position: "top-center" });
      }
      onClose(true);
    } catch (error: any) {
      toast.error(error.message || "Error al guardar cliente", { position: "top-center" });
    }
  };

  const handleChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
                <Label htmlFor="clientId">Client ID *</Label>
                <Input
                  id="clientId"
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

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onClose(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {clientId ? "Actualizar" : "Crear"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
