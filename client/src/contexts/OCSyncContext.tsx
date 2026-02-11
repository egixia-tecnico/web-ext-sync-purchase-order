/**
 * OCSyncContext - Store principal para la Mini App de verificación de OC
 * 
 * Credenciales por defecto almacenadas persistentemente.
 * Al abrir el diálogo de configuración, los campos se muestran en blanco (no precargados).
 * Token dinámico: se obtiene vía gettoken y se renueva automáticamente en error 401.
 * Al cargar datos, todos los registros quedan seleccionados por defecto.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { egixiaApi } from "@/lib/egixia-api";

export interface OCRecord {
  id: string;
  buyer_external_code: string;
  provider_external_code: string;
  purchase_order_number: string;
  status?: "pending" | "checking" | "synced" | "not_found" | "provider_not_found" | "error" | "synced_with_error";
  statusMessage?: string;
  buyer_name?: string;
  provider_name?: string;
  provider_exists?: boolean;
  syncResult?: {
    TotalOCs: string;
    Creadas: string;
    Actualizadas: string;
    SinProveedor: string;
    ConErrorData: string;
    ProveedorNoExiste: string;
    CompradorNoExiste: string;
    AnuladasNoRegistradas: string;
  };
}

export interface KPIData {
  total: number;
  synced: number;
  notFound: number;
  providerNotFound: number;
  error: number;
  syncedWithError: number;
  pending: number;
  checking: number;
}

export interface ApiConfig {
  baseUrl: string;
  token: string;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
}

/** Credenciales por defecto - almacenadas persistentemente para todos los usuarios */
const DEFAULT_API_CONFIG: ApiConfig = {
  baseUrl: "https://egixia.net/ProveedoresManuelita",
  token: "",
  username: "apimanager.manuelita",
  password: "1nt3grAc1on@.2026",
  clientId: "a4559cf615a14a20acb38b6eef9d315e",
  clientSecret: "823e412901664bcfa1ab2168b69ddbeb",
};

const STORAGE_KEY = "egixia_oc_sync_config";

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

interface OCSyncContextType {
  records: OCRecord[];
  setRecords: (records: OCRecord[]) => void;
  updateRecord: (id: string, updates: Partial<OCRecord>) => void;
  kpi: KPIData;
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
  progress: { current: number; total: number };
  setProgress: (p: { current: number; total: number }) => void;
  apiConfig: ApiConfig;
  updateApiConfig: (config: Partial<ApiConfig>) => void;
  replaceApiConfig: (config: ApiConfig) => void;
  connectionStatus: ConnectionStatus;
  connectionError: string;
  reconnect: () => Promise<void>;
  connectWithCredentials: (config: ApiConfig) => Promise<boolean>;
  selectedRecords: Set<string>;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  selectByStatus: (status: OCRecord["status"]) => void;
}

const OCSyncContext = createContext<OCSyncContextType | null>(null);

function loadConfig(): ApiConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to ensure all fields exist
      return { ...DEFAULT_API_CONFIG, ...parsed, token: "" };
    }
  } catch {}
  return { ...DEFAULT_API_CONFIG };
}

function saveConfig(config: ApiConfig) {
  try {
    // Persist credentials (not token - token is dynamic)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      baseUrl: config.baseUrl,
      username: config.username,
      password: config.password,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    }));
  } catch {}
}

export function OCSyncProvider({ children }: { children: ReactNode }) {
  const [records, setRecordsState] = useState<OCRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [apiConfig, setApiConfigState] = useState<ApiConfig>(loadConfig);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState("");
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());

  const updateApiConfig = useCallback((partial: Partial<ApiConfig>) => {
    setApiConfigState(prev => {
      const updated = { ...prev, ...partial };
      saveConfig(updated);
      return updated;
    });
  }, []);

  const replaceApiConfig = useCallback((config: ApiConfig) => {
    setApiConfigState(config);
    saveConfig(config);
  }, []);

  /** Conectar a la API con las credenciales dadas */
  const doConnect = useCallback(async (cfg: ApiConfig): Promise<boolean> => {
    if (!cfg.baseUrl || !cfg.username || !cfg.password || !cfg.clientId || !cfg.clientSecret) {
      setConnectionStatus("error");
      setConnectionError("Configuración de API incompleta. Configure las credenciales.");
      return false;
    }

    setConnectionStatus("connecting");
    setConnectionError("");

    try {
      egixiaApi.configure(cfg.baseUrl, "");
      const result = await egixiaApi.login({
        UserName: cfg.username,
        Password: cfg.password,
        ClientId: cfg.clientId,
        ClientSecret: cfg.clientSecret,
      });

      if (result.AccessToken) {
        const newConfig = { ...cfg, token: result.AccessToken };
        setApiConfigState(newConfig);
        egixiaApi.configure(cfg.baseUrl, result.AccessToken);
        // Guardar credenciales en egixiaApi para renovación automática de token
        egixiaApi.setCredentials({
          UserName: cfg.username,
          Password: cfg.password,
          ClientId: cfg.clientId,
          ClientSecret: cfg.clientSecret,
        });
        setConnectionStatus("connected");
        setConnectionError("");
        saveConfig(cfg);
        return true;
      } else {
        setConnectionStatus("error");
        setConnectionError("No se recibió token de acceso del servidor.");
        return false;
      }
    } catch (err: any) {
      setConnectionStatus("error");
      setConnectionError(err?.message || "Error de conexión desconocido. Verifique la URL y credenciales.");
      return false;
    }
  }, []);

  /** Reconectar con la configuración actual */
  const reconnect = useCallback(async () => {
    await doConnect(apiConfig);
  }, [doConnect, apiConfig]);

  /** Conectar con credenciales nuevas (desde el diálogo de configuración) */
  const connectWithCredentials = useCallback(async (config: ApiConfig): Promise<boolean> => {
    return doConnect(config);
  }, [doConnect]);

  // Auto-connect on mount
  useEffect(() => {
    doConnect(apiConfig);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Al cargar datos, todos los registros quedan seleccionados por defecto */
  const setRecords = useCallback((newRecords: OCRecord[]) => {
    setRecordsState(newRecords);
    // Seleccionar todos automáticamente
    setSelectedRecords(new Set(newRecords.map(r => r.id)));
  }, []);

  const updateRecord = useCallback((id: string, updates: Partial<OCRecord>) => {
    setRecordsState(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const kpi: KPIData = {
    total: records.length,
    synced: records.filter(r => r.status === "synced").length,
    notFound: records.filter(r => r.status === "not_found").length,
    providerNotFound: records.filter(r => r.status === "provider_not_found").length,
    error: records.filter(r => r.status === "error").length,
    syncedWithError: records.filter(r => r.status === "synced_with_error").length,
    pending: records.filter(r => r.status === "pending" || !r.status).length,
    checking: records.filter(r => r.status === "checking").length,
  };

  const toggleSelection = useCallback((id: string) => {
    setSelectedRecords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedRecords(new Set(records.map(r => r.id)));
  }, [records]);

  const deselectAll = useCallback(() => {
    setSelectedRecords(new Set());
  }, []);

  const selectByStatus = useCallback((status: OCRecord["status"]) => {
    setSelectedRecords(new Set(records.filter(r => r.status === status).map(r => r.id)));
  }, [records]);

  return (
    <OCSyncContext.Provider value={{
      records, setRecords, updateRecord, kpi,
      isProcessing, setIsProcessing,
      progress, setProgress,
      apiConfig, updateApiConfig, replaceApiConfig,
      connectionStatus, connectionError, reconnect, connectWithCredentials,
      selectedRecords, toggleSelection, selectAll, deselectAll, selectByStatus,
    }}>
      {children}
    </OCSyncContext.Provider>
  );
}

export function useOCSync() {
  const ctx = useContext(OCSyncContext);
  if (!ctx) throw new Error("useOCSync must be used within OCSyncProvider");
  return ctx;
}
