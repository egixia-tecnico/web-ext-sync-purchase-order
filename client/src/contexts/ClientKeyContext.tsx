import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

interface ClientKeyContextType {
  clientKey: string | null;
  clientData: {
    id: number;
    name: string;
    primaryColor: string;
    syncRules: string | null;
  } | null;
  loading: boolean;
}

const ClientKeyContext = createContext<ClientKeyContextType>({
  clientKey: null,
  clientData: null,
  loading: true,
});

export function ClientKeyProvider({ children }: { children: ReactNode }) {
  const [clientKey, setClientKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Read clientKey from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const keyFromUrl = params.get("clientKey");
    
    if (keyFromUrl) {
      setClientKey(keyFromUrl);
      sessionStorage.setItem("clientKey", keyFromUrl);
    } else {
      // Try to load from sessionStorage
      const keyFromSession = sessionStorage.getItem("clientKey");
      if (keyFromSession) {
        setClientKey(keyFromSession);
      }
    }
    
    setLoading(false);
  }, []);

  // Fetch client data by clientKey
  const { data: clientData } = trpc.clients.getByKey.useQuery(
    { clientKey: clientKey! },
    { enabled: !!clientKey }
  );

  return (
    <ClientKeyContext.Provider
      value={{
        clientKey,
        clientData: clientData || null,
        loading,
      }}
    >
      {children}
    </ClientKeyContext.Provider>
  );
}

export function useClientKey() {
  return useContext(ClientKeyContext);
}
