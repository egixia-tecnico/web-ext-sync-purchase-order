import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WifiOff } from "lucide-react";

interface CommunicationFailureDialogProps {
  open: boolean;
  onClose: () => void;
  type?: "token" | "service";
}

export default function CommunicationFailureDialog({
  open,
  onClose,
  type = "token",
}: CommunicationFailureDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <WifiOff className="w-6 h-6 text-red-600" />
            </div>
            <AlertDialogTitle className="text-red-700 text-lg leading-tight">
              Falla de Comunicación
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
            {type === "token" ? (
              <>
                Tenemos falla de comunicación con la autenticación del servicio,
                espere <strong>10 minutos</strong> e intente de nuevo.
              </>
            ) : (
              <>
                Se detectaron múltiples fallos consecutivos en la comunicación
                con el servicio. Espere <strong>10 minutos</strong> e intente de
                nuevo.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={onClose}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Entendido
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
