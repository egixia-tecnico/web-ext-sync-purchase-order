import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { checkAdminSession, listClients, setActiveClient, deleteClientById } from "@/lib/api";
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
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<number | null>(null);

  const { data: adminSession, isLoading: sessionLoading } = useQuery({
    queryKey: ["adminSession"],
    queryFn: checkAdminSession,
    retry: false,
    staleTime: 30_000,
  });

  const { data: clients, isLoading: clientsLoading, refetch } = useQuery({
    queryKey: ["clients"],
    queryFn: listClients,
    enabled: adminSession?.isAdmin === true,
  });

  const isLoading = sessionLoading || clientsLoading;

  useEffect(() => {
    if (!sessionLoading && adminSession?.isAdmin !== true) {
      setLocation("/admin/login?returnPath=%2Fclients");
    }
  }, [sessionLoading, adminSession, setLocation]);

  if (sessionLoading || (adminSession?.isAdmin && clientsLoading)) {
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
      await setActiveClient(id);
      toast.success("Cliente activado correctamente", { position: "bottom-left" });
      refetch();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Error al activar cliente", { position: "bottom-left" });
    }
  };

  const handleDelete = async () => {
    if (!deletingClientId) return;
    try {
      await deleteClientById(deletingClientId);
      toast.success("Cliente eliminado correctamente", { position: "bottom-left" });
      setDeletingClientId(null);
      refetch();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Error al eliminar cliente", { position: "bottom-left" });
    }
  };

  const handleDialogClose = (success: boolean) => {
    setShowDialog(false);
    setEditingClientId(null);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
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
          {adminSession?.email && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Sesión activa: {adminSession.email}
            </p>
          )}
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
                <TableHead>Client ID</TableHead>
                <TableHead className="w-24">Color</TableHead>
                <TableHead className="w-28">Lotes</TableHead>
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
                    {client.clientId}
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
                  <TableCell>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{client.batchSize ?? 10}</span> peticiones
                      <br />
                      <span className="font-medium text-foreground">{client.batchDelaySeconds ?? 3}</span>s espera
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
