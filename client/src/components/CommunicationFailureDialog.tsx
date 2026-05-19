import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WifiOff, RefreshCw, Clock } from "lucide-react";
import { useState } from "react";

interface CommunicationFailureDialogProps {
  open: boolean;
  /** Called when the user clicks "Reintentar" and the retry succeeds */
  onRetrySuccess: () => void;
  /** Called when the user clicks "Reintentar" — should attempt getToken and return true on success */
  onRetry: () => Promise<boolean>;
  type?: "token" | "service";
}

export default function CommunicationFailureDialog({
  open,
  onRetrySuccess,
  onRetry,
  type = "token",
}: CommunicationFailureDialogProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    setRetryFailed(false);
    try {
      const success = await onRetry();
      if (success) {
        setRetrying(false);
        setRetryFailed(false);
        onRetrySuccess();
      } else {
        setRetrying(false);
        setRetryFailed(true);
      }
    } catch {
      setRetrying(false);
      setRetryFailed(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {/* bloqueado */}}>
      {/* onOpenChange vacío + onEscapeKeyDown/onInteractOutside bloqueados → modal no se puede cerrar */}
      <DialogContent
        className="max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="flex flex-col items-center gap-4 mb-2 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <WifiOff className="w-8 h-8 text-red-600" />
            </div>
            <DialogTitle className="text-red-700 text-xl leading-tight">
              Sin conexión con el servicio
            </DialogTitle>
          </div>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground leading-relaxed text-center space-y-3">
              <p>
                {type === "token"
                  ? "No fue posible establecer conexión con el servicio de autenticación."
                  : "Se detectaron múltiples fallos consecutivos en la comunicación con el servicio."}
              </p>
              <p>
                <strong>La herramienta no está disponible en este momento.</strong>{" "}
                Por favor intente más tarde o contacte al administrador del sistema.
              </p>
              {retryFailed && (
                <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  <Clock className="w-4 h-4 shrink-0" />
                  El servicio sigue sin responder. Espere unos minutos e intente de nuevo.
                </div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleRetry}
            disabled={retrying}
            className="w-full gap-2"
            style={{ backgroundColor: retrying ? undefined : "#dc2626" }}
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Verificando conexión..." : "Reintentar conexión"}
          </Button>
          <p className="text-[11px] text-muted-foreground/60 text-center">
            Esta ventana permanecerá abierta hasta que se restablezca la conexión.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
