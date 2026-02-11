/**
 * KPIDashboard - Tarjetas KPI con indicadores semánticos
 * Design: "Operational Clarity" - tarjetas con borde superior grueso del color semántico
 */
import { motion } from "framer-motion";
import { useOCSync } from "@/contexts/OCSyncContext";
import {
  Package, CheckCircle2, XCircle, UserX, AlertTriangle,
  Clock, Loader2, AlertOctagon
} from "lucide-react";

interface KPICardProps {
  label: string;
  value: number;
  total: number;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  delay: number;
  onClick?: () => void;
}

function KPICard({ label, value, total, color, bgColor, icon, delay, onClick }: KPICardProps) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      onClick={onClick}
      className={`
        bg-card rounded-xl border shadow-sm overflow-hidden
        ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
      `}
    >
      <div className="h-1" style={{ backgroundColor: color }} />
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <div className="flex items-baseline gap-1.5 mt-1.5">
              <span
                className="text-2xl font-bold tabular-nums"
                style={{ fontFamily: "'Space Grotesk', sans-serif", color }}
              >
                {value}
              </span>
              {total > 0 && (
                <span className="text-xs text-muted-foreground">
                  / {total}
                </span>
              )}
            </div>
          </div>
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: bgColor }}
          >
            {icon}
          </div>
        </div>
        {total > 0 && (
          <div className="mt-3">
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 0.8, delay: delay + 0.2, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{percentage}%</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function KPIDashboard() {
  const { kpi, records, selectByStatus, deselectAll } = useOCSync();

  if (records.length === 0) return null;

  const cards: Omit<KPICardProps, "delay">[] = [
    {
      label: "Total OC",
      value: kpi.total,
      total: kpi.total,
      color: "#64748b",
      bgColor: "#f1f5f9",
      icon: <Package className="w-4 h-4 text-slate-500" />,
      onClick: () => deselectAll(),
    },
    {
      label: "Sincronizadas",
      value: kpi.synced,
      total: kpi.total,
      color: "#10b981",
      bgColor: "#ecfdf5",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
      onClick: () => selectByStatus("synced"),
    },
    {
      label: "No encontradas",
      value: kpi.notFound,
      total: kpi.total,
      color: "#f59e0b",
      bgColor: "#fffbeb",
      icon: <XCircle className="w-4 h-4 text-amber-500" />,
      onClick: () => selectByStatus("not_found"),
    },
    {
      label: "Proveedor no existe",
      value: kpi.providerNotFound,
      total: kpi.total,
      color: "#ef4444",
      bgColor: "#fef2f2",
      icon: <UserX className="w-4 h-4 text-red-500" />,
      onClick: () => selectByStatus("provider_not_found"),
    },
    {
      label: "Error sistema",
      value: kpi.error,
      total: kpi.total,
      color: "#dc2626",
      bgColor: "#fef2f2",
      icon: <AlertOctagon className="w-4 h-4 text-red-600" />,
      onClick: () => selectByStatus("error"),
    },
    {
      label: "Sync con error",
      value: kpi.syncedWithError,
      total: kpi.total,
      color: "#f97316",
      bgColor: "#fff7ed",
      icon: <AlertTriangle className="w-4 h-4 text-orange-500" />,
      onClick: () => selectByStatus("synced_with_error"),
    },
    {
      label: "Pendientes",
      value: kpi.pending,
      total: kpi.total,
      color: "#94a3b8",
      bgColor: "#f8fafc",
      icon: <Clock className="w-4 h-4 text-slate-400" />,
      onClick: () => selectByStatus("pending"),
    },
    {
      label: "Verificando",
      value: kpi.checking,
      total: kpi.total,
      color: "#6366f1",
      bgColor: "#eef2ff",
      icon: <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />,
      onClick: () => selectByStatus("checking"),
    },
  ];

  // Only show cards that have values or are important
  const visibleCards = cards.filter(c => 
    c.value > 0 || ["Total OC", "Sincronizadas", "No encontradas", "Proveedor no existe", "Pendientes"].includes(c.label)
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {visibleCards.map((card, i) => (
        <KPICard key={card.label} {...card} delay={i * 0.08} />
      ))}
    </div>
  );
}
