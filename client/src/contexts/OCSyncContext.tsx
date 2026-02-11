import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface OCRecord {
  id: string;
  buyer_external_code: string;
  provider_external_code: string;
  purchase_order_number: string;
  // Results after verification
  status?: "pending" | "checking" | "synced" | "not_found" | "provider_not_found" | "error" | "synced_with_error";
  statusMessage?: string;
  buyer_name?: string;
  provider_name?: string;
  provider_exists?: boolean;
  // Sync results
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

interface ApiConfig {
  baseUrl: string;
  token: string;
}

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
  setApiConfig: (config: ApiConfig) => void;
  selectedRecords: Set<string>;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  selectByStatus: (status: OCRecord["status"]) => void;
}

const OCSyncContext = createContext<OCSyncContextType | null>(null);

export function OCSyncProvider({ children }: { children: ReactNode }) {
  const [records, setRecordsState] = useState<OCRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [apiConfig, setApiConfig] = useState<ApiConfig>({ baseUrl: "", token: "" });
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());

  const setRecords = useCallback((newRecords: OCRecord[]) => {
    setRecordsState(newRecords);
    setSelectedRecords(new Set());
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
      apiConfig, setApiConfig,
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
