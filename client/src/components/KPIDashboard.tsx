/**
 * KPIDashboard - Tarjetas KPI con indicadores semánticos
 * Solo visible en Step 3 (Resultados) y Step 4 (Sincronizar)
 * Al hacer clic en un KPI, filtra la tabla por ese estado.
 */
import { motion } from "framer-motion";
import { useOCSync } from "@/contexts/OCSyncContext";
import { useThemeColor } from "@/contexts/ThemeColorContext";
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
  isActive?: boolean;
  onClick?: () => void;
}

function KPICard({ label, value, total, color, bgColor, icon, delay, isActive, onClick }: KPICardProps) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      onClick={onClick}
      className={`
        bg-card rounded-xl border shadow-sm overflow-hidden
        ${onClick ? "cursor-pointer hover:shadow-md transition-all" : ""}
        ${isActive ? "ring-2 ring-offset-1" : ""}
      `}
      style={isActive ? { borderColor: color, boxShadow: `0 0 0 2px ${color}33` } : undefined}
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
  const { kpi, records, activeKPIFilter, setActiveKPIFilter, currentStep } = useOCSync();

  // Only show in step 3 (Resultados) and step 4 (Sincronizar) and step 5 (Exportar)
  if (records.length === 0 || currentStep < 3) return null;

  const handleKPIClick = (filterKey: string | null) => {
    if (activeKPIFilter === filterKey) {
      setActiveKPIFilter(null); // Toggle off
    } else {
      setActiveKPIFilter(filterKey);
    }
  };

  const cards: (Omit<KPICardProps, "delay"> & { filterKey: string | null })[] = [
    {
      label: "Total OC",
      value: kpi.total,
      total: kpi.total,
      color: "#64748b",
      bgColor: "#f1f5f9",
      icon: <Package className="w-4 h-4 text-slate-500" />,
      isActive: activeKPIFilter === null,
      filterKey: null,
      onClick: () => handleKPIClick(null),
    },
    {
      label: "Sincronizadas",
      value: kpi.synced,
      total: kpi.total,
      color: "#10b981",
      bgColor: "#ecfdf5",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
      isActive: activeKPIFilter === "synced",
      filterKey: "synced",
      onClick: () => handleKPIClick("synced"),
    },
    {
      label: "No encontradas",
      value: kpi.notFound,
      total: kpi.total,
      color: "#f59e0b",
      bgColor: "#fffbeb",
      icon: <XCircle className="w-4 h-4 text-amber-500" />,
      isActive: activeKPIFilter === "not_found",
      filterKey: "not_found",
      onClick: () => handleKPIClick("not_found"),
    },
    {
      label: "Proveedor no existe",
      value: kpi.supplierNotExists,
      total: kpi.total,
      color: "#ef4444",
      bgColor: "#fef2f2",
      icon: <UserX className="w-4 h-4 text-red-500" />,
      isActive: activeKPIFilter === "supplier_not_exists",
      filterKey: "supplier_not_exists",
      onClick: () => handleKPIClick("supplier_not_exists"),
    },
    {
      label: "Error sistema",
      value: kpi.error,
      total: kpi.total,
      color: "#dc2626",
      bgColor: "#fef2f2",
      icon: <AlertOctagon className="w-4 h-4 text-red-600" />,
      isActive: activeKPIFilter === "error",
      filterKey: "error",
      onClick: () => handleKPIClick("error"),
    },
  ];

  // Only show cards that have values or are important
  const visibleCards = cards.filter(c =>
    c.value > 0 || ["Total OC", "Sincronizadas", "No encontradas", "Proveedor no existe"].includes(c.label)
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {visibleCards.map((card, i) => (
          <KPICard key={card.label} {...card} delay={i * 0.08} />
        ))}
      </div>
    </motion.div>
  );
}
