import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MagicLinkCallback() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const validateMagicLink = trpc.auth.validateMagicLink.useMutation({
    onSuccess: (data) => {
      setStatus("success");
      // Redirect to returnPath or default to /clients after 2 seconds
      const targetPath = data.returnPath || "/clients";
      setTimeout(() => {
        setLocation(targetPath);
      }, 2000);
    },
    onError: (error) => {
      setStatus("error");
      setErrorMessage(error.message);
    },
  });

  useEffect(() => {
    // Get token from URL query params
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    
    if (!tokenParam) {
      setStatus("error");
      setErrorMessage("Token no encontrado en la URL");
      return;
    }

    setToken(tokenParam);
    validateMagicLink.mutate({ token: tokenParam });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-center">Verificando Acceso</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          {status === "loading" && (
            <>
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              <p className="text-sm text-muted-foreground">Validando tu link de acceso...</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <div className="text-center space-y-2">
                <p className="font-semibold text-green-800">¡Acceso Autorizado!</p>
                <p className="text-sm text-muted-foreground">
                  Redirigiendo a Gestión de Clientes...
                </p>
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-10 h-10 text-red-600" />
              </div>
              <div className="text-center space-y-2">
                <p className="font-semibold text-red-800">Error de Autenticación</p>
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
              </div>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setLocation("/admin/login")}
              >
                Solicitar nuevo link
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
