import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Shield, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  
  const sendMagicLink = trpc.auth.sendMagicLink.useMutation({
    onSuccess: () => {
      setSent(true);
      toast.success("Link mágico enviado", {
        description: "Revisa tu correo para acceder",
      });
    },
    onError: (error) => {
      toast.error("Error", {
        description: error.message,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.endsWith("@egixia.com")) {
      toast.error("Solo se permiten correos @egixia.com");
      return;
    }
    sendMagicLink.mutate({ email });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mx-auto">
            <Shield className="w-6 h-6 text-blue-600" />
          </div>
          <CardTitle className="text-center text-2xl">Acceso Administrador</CardTitle>
          <CardDescription className="text-center">
            Ingresa tu correo @egixia.com para recibir un link de acceso
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu.nombre@egixia.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={sendMagicLink.isPending}
              >
                {sendMagicLink.isPending ? "Enviando..." : "Enviar Link Mágico"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                <p className="text-sm text-green-800 text-center">
                  <strong>Link enviado exitosamente</strong>
                  <br />
                  Revisa tu correo {email} y haz clic en el link para acceder.
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                El link expira en 15 minutos
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
              >
                Enviar otro link
              </Button>
            </div>
          )}
          
          <div className="mt-6 pt-6 border-t">
            <Link href="/">
              <Button variant="ghost" className="w-full" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver al inicio
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
