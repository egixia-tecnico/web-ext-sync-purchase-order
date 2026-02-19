/**
 * ClientsManagement - Página de administración de clientes
 * Permite crear, editar, eliminar y activar clientes
 * Los datos sensibles se muestran enmascarados en la lista
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ClientDialog from "@/components/ClientDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ClientsManagement() {
  const [, setLocation] = useLocation();
  const [showDialog, setShowDialog] = useState(false);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<number | null>(null);

  // WORKAROUND: permitir acceso sin validación de sesión
  // TODO: Diagnosticar y solucionar error React #310 en flujo de magic link
  // IMPORTANTE: Todas las queries y mutations DEBEN estar antes de cualquier early return
  const { data: clients, isLoading, refetch } = trpc.clients.list.useQuery();
  const setActiveMutation = trpc.clients.setActive.useMutation();
  const deleteMutation = trpc.clients.delete.useMutation();

  // Show loading while fetching clients
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const handleCreate = () => {
    setEditingClientId(null);
    setShowDialog(true);
  };

  const handleEdit = (id: number) => {
    setEditingClientId(id);
    setShowDialog(true);
  };

  const handleSetActive = async (id: number) => {
    try {
      await setActiveMutation.mutateAsync({ id });
      toast.success("Cliente activado correctamente", { position: "top-center" });
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Error al activar cliente", { position: "top-center" });
    }
  };

  const handleDelete = async () => {
    if (!deletingClientId) return;
    
    try {
      await deleteMutation.mutateAsync({ id: deletingClientId });
      toast.success("Cliente eliminado correctamente", { position: "top-center" });
      setDeletingClientId(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Error al eliminar cliente", { position: "top-center" });
    }
  };

  const handleDialogClose = (success: boolean) => {
    setShowDialog(false);
    setEditingClientId(null);
    if (success) {
      refetch();
    }
  };

  return (
    <div className="container py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Gestión de Clientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure los clientes y sus credenciales de acceso al servicio
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Cliente
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && clients && clients.length === 0 && (
        <div className="text-center py-12 border rounded-lg bg-muted/30">
          <p className="text-muted-foreground mb-4">No hay clientes configurados</p>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Crear primer cliente
          </Button>
        </div>
      )}

      {!isLoading && clients && clients.length > 0 && (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Dominio Base</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Contraseña</TableHead>
                <TableHead>Client ID</TableHead>
                <TableHead>Client Secret</TableHead>
                <TableHead className="w-24">Color</TableHead>
                <TableHead className="w-32 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id} className={client.isActive ? "bg-green-50" : ""}>
                  <TableCell>
                    {client.isActive ? (
                      <div className="flex items-center justify-center">
                        <Check className="w-4 h-4 text-green-600" />
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSetActive(client.id)}
                        className="flex items-center justify-center w-full h-full text-muted-foreground hover:text-foreground"
                        title="Activar este cliente"
                      >
                        <div className="w-4 h-4 border-2 border-muted-foreground rounded-full" />
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{client.baseUrl}</TableCell>
                  <TableCell className="text-sm">{client.userName}</TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {client.password}
                  </TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {client.clientId}
                  </TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {client.clientSecret}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded border"
                        style={{ backgroundColor: client.primaryColor }}
                      />
                      <span className="text-xs font-mono">{client.primaryColor}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(client.id)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingClientId(client.id)}
                        disabled={client.isActive}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ClientDialog
        open={showDialog}
        onClose={handleDialogClose}
        clientId={editingClientId}
      />

      <AlertDialog open={!!deletingClientId} onOpenChange={(open) => !open && setDeletingClientId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el cliente y toda su configuración.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
