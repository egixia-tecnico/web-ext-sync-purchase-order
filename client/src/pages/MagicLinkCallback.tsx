// Supabase Auth handles the magic link automatically when the user clicks it.
// This page just waits for the session to be established and redirects.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

function getDestinationLabel(returnPath: string): string {
  if (returnPath === "/clients") return "Gestión de Clientes";
  if (returnPath.includes("openHistory=true")) return "Historial de Verificaciones";
  if (returnPath.includes("openLogs=true")) return "Log de Integraciones";
  return "la aplicación";
}

export default function MagicLinkCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [destinationLabel, setDestinationLabel] = useState("la aplicación");

  useEffect(() => {
    // Supabase Auth fires onAuthStateChange with SIGNED_IN after the magic link is clicked
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user?.email?.endsWith("@egixia.com")) {
        const params = new URLSearchParams(window.location.search);
        const returnPath = params.get("returnPath") || "/clients";
        setDestinationLabel(getDestinationLabel(returnPath));
        setStatus("success");
        setTimeout(() => setLocation(returnPath), 2000);
      } else if (event === "SIGNED_IN" && session?.user?.email && !session.user.email.endsWith("@egixia.com")) {
        // Non-egixia email — sign out immediately
        supabase.auth.signOut();
        setStatus("error");
        setErrorMessage("Solo se permiten correos @egixia.com para acceso de administrador.");
      } else if (event === "INITIAL_SESSION" && !session) {
        // No session after callback — likely invalid/expired token
        setStatus("error");
        setErrorMessage("Link inválido o expirado. Solicita un nuevo link de acceso.");
      }
    });

    return () => subscription.unsubscribe();
  }, [setLocation]);

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
                <p className="text-sm text-muted-foreground">Redirigiendo a {destinationLabel}...</p>
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
              <Button variant="outline" className="mt-4" onClick={() => setLocation("/admin/login")}>
                Solicitar nuevo link
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
