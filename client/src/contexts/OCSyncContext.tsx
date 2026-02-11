/**
 * OCSyncContext - Store principal para la Mini App de verificación de OC
 * 
 * Ahora usa tRPC para comunicarse con el backend proxy.
 * Las credenciales se almacenan en la base de datos del servidor.
 * Token dinámico manejado server-side con renovación automática en error 401.
 * Al cargar datos, todos los registros quedan seleccionados por defecto.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface OCRecord {
  id: string;
  buyer_external_code: string;
  provider_external_code: string;
  purchase_order_number: string;
  status?: "pending" | "checking" | "synced" | "not_found" | "supplier_not_exists" | "error" | "synced_with_error";
  statusMessage?: string;
  buyer_name?: string;
  provider_name?: string;
  provider_exists?: boolean;
  portalData?: {
    buyerName: string;
    providerCode: string;
    providerName: string;
    documentDate: string;
    deliveryStatus: string;
    canceled: string;
    updated: string;
    synchronizationDate: string;
  };
}

export interface KPIData {
  total: number;
  synced: number;
  notFound: number;
  supplierNotExists: number;
  error: number;
  syncedWithError: number;
  pending: number;
  checking: number;
}

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error" | "disconnected";

interface OCSyncContextType {
  records: OCRecord[];
  setRecords: (records: OCRecord[]) => void;
  updateRecord: (id: string, updates: Partial<OCRecord>) => void;
  updateRecordsBatch: (updates: Array<{ id: string; updates: Partial<OCRecord> }>) => void;
  kpi: KPIData;
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
  progress: { current: number; total: number };
  setProgress: (p: { current: number; total: number }) => void;
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (s: ConnectionStatus) => void;
  connectionError: string | null;
  setConnectionError: (e: string | null) => void;
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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());

  /** Al cargar datos, todos los registros quedan seleccionados por defecto */
  const setRecords = useCallback((newRecords: OCRecord[]) => {
    setRecordsState(newRecords);
    setSelectedRecords(new Set(newRecords.map(r => r.id)));
  }, []);

  const updateRecord = useCallback((id: string, updates: Partial<OCRecord>) => {
    setRecordsState(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const updateRecordsBatch = useCallback((updates: Array<{ id: string; updates: Partial<OCRecord> }>) => {
    setRecordsState(prev => {
      const updateMap = new Map(updates.map(u => [u.id, u.updates]));
      return prev.map(r => {
        const upd = updateMap.get(r.id);
        return upd ? { ...r, ...upd } : r;
      });
    });
  }, []);

  const kpi: KPIData = {
    total: records.length,
    synced: records.filter(r => r.status === "synced").length,
    notFound: records.filter(r => r.status === "not_found").length,
    supplierNotExists: records.filter(r => r.status === "supplier_not_exists").length,
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
      records, setRecords, updateRecord, updateRecordsBatch, kpi,
      isProcessing, setIsProcessing,
      progress, setProgress,
      connectionStatus, setConnectionStatus,
      connectionError, setConnectionError,
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
