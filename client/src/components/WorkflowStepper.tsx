/**
 * WorkflowStepper - Indicador visual del flujo de trabajo
 * Usa currentStep del contexto centralizado.
 * Permite clic en steps completados para navegar hacia atrás.
 */
import { motion } from "framer-motion";
import { useOCSync, type WorkflowStep } from "@/contexts/OCSyncContext";
import { useThemeColor } from "@/contexts/ThemeColorContext";
import { Upload, Search, BarChart3, RefreshCw, Download, Check } from "lucide-react";

const STEPS = [
  { id: 1 as WorkflowStep, label: "Cargar datos", icon: Upload },
  { id: 2 as WorkflowStep, label: "Verificar", icon: Search },
  { id: 3 as WorkflowStep, label: "Resultados", icon: BarChart3 },
  { id: 4 as WorkflowStep, label: "Sincronizar", icon: RefreshCw },
  { id: 5 as WorkflowStep, label: "Exportar", icon: Download },
];

export default function WorkflowStepper() {
  const { currentStep, setCurrentStep, records } = useOCSync();
  const { primaryRgb } = useThemeColor();
  const { r, g, b } = primaryRgb;

  // Determine the highest step the user has reached (to allow going back)
  const maxReachableStep = currentStep;

  const handleStepClick = (stepId: WorkflowStep) => {
    // Only allow clicking on completed steps or current step
    if (stepId <= maxReachableStep && records.length > 0) {
      setCurrentStep(stepId);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="bg-card rounded-xl border shadow-sm p-4"
    >
      <div className="flex items-center justify-between">
        {STEPS.map((step, idx) => {
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;
          const isClickable = step.id <= maxReachableStep && records.length > 0;
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
              <div
                className={`flex flex-col items-center gap-1.5 ${isClickable ? "cursor-pointer" : ""}`}
                onClick={() => isClickable && handleStepClick(step.id)}
              >
                <motion.div
                  animate={{
                    scale: isActive ? 1.1 : 1,
                    backgroundColor: isCompleted
                      ? `rgb(${r}, ${g}, ${b})`
                      : isActive
                        ? `rgb(${r}, ${g}, ${b})`
                        : "#e2e8f0",
                  }}
                  transition={{ duration: 0.3 }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${isClickable && !isActive ? "hover:scale-105 transition-transform" : ""}`}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : (
                    <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
                  )}
                </motion.div>
                <span className={`text-[10px] font-medium whitespace-nowrap ${
                  isActive ? "text-foreground" : isCompleted ? "text-muted-foreground" : "text-muted-foreground/60"
                }`}>
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className="flex-1 mx-2 h-0.5 rounded-full bg-border relative overflow-hidden">
                  <motion.div
                    animate={{
                      width: isCompleted ? "100%" : isActive ? "50%" : "0%",
                    }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
