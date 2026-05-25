import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClientByKey } from "@/lib/api";

interface ClientKeyContextType {
  clientKey: string | null;
  clientData: {
    id: number;
    name: string;
    primaryColor: string;
    syncRules: string | null;
    isActive: boolean;
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
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const keyFromUrl = params.get("clientKey");
    if (keyFromUrl) {
      setClientKey(keyFromUrl);
      sessionStorage.setItem("clientKey", keyFromUrl);
    } else {
      const keyFromSession = sessionStorage.getItem("clientKey");
      if (keyFromSession) setClientKey(keyFromSession);
    }
    setResolving(false);
  }, []);

  const { data: clientData, isLoading: clientLoading } = useQuery({
    queryKey: ["client", clientKey],
    queryFn: () => getClientByKey(clientKey!),
    enabled: !!clientKey && !resolving,
    staleTime: 60_000,
  });

  return (
    <ClientKeyContext.Provider
      value={{
        clientKey,
        clientData: clientData
          ? {
              id: clientData.id,
              name: clientData.name,
              primaryColor: clientData.primaryColor,
              syncRules: clientData.syncRules,
              isActive: clientData.isActive,
            }
          : null,
        loading: resolving || clientLoading,
      }}
    >
      {children}
    </ClientKeyContext.Provider>
  );
}

export function useClientKey() {
  return useContext(ClientKeyContext);
}
