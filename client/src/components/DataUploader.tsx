/**
 * DataUploader - Zona de carga de datos por archivo o entrada manual
 * Design: "Operational Clarity" - zona de drop con borde dashed animado
 * Incluye botón de descarga de plantilla .xlsx con formato texto
 */
import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useOCSync } from "@/contexts/OCSyncContext";
import { parseFileData, parseManualInput, downloadTemplate } from "@/lib/file-parser";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Keyboard, X, FileCheck, AlertTriangle, FileUp, Download } from "lucide-react";

export default function DataUploader() {
  const { records, setRecords } = useOCSync();
  const [isDragging, setIsDragging] = useState(false);
  const [manualText, setManualText] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
  }, []);

  const processFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    
    if (!["xlsx", "xls", "csv"].includes(ext || "")) {
      toast.error("Formato no soportado. Use archivos .xlsx, .xls o .csv");
      return;
    }

    try {
      const parsed = await parseFileData(file);
      setRecords(parsed);
      setFileName(file.name);
      toast.success(`${parsed.length} órdenes de compra cargadas desde ${file.name}. Todos los registros seleccionados.`);
    } catch (err: any) {
      toast.error(err?.message || "Error al procesar el archivo");
    }
  };

  const handleManualSubmit = () => {
    if (!manualText.trim()) {
      toast.error("Ingrese datos para procesar");
      return;
    }
    const parsed = parseManualInput(manualText);
    if (parsed.length === 0) {
      toast.error("No se encontraron registros válidos. Use formato: comprador, proveedor, nro_oc (uno por línea)");
      return;
    }
    setRecords(parsed);
    toast.success(`${parsed.length} órdenes de compra cargadas. Todos los registros seleccionados.`);
  };

  const handleClear = () => {
    setRecords([]);
    setFileName("");
    setManualText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownloadTemplate = () => {
    try {
      downloadTemplate();
      toast.success("Plantilla descargada correctamente");
    } catch (err: any) {
      toast.error("Error al generar la plantilla");
    }
  };

  if (records.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border shadow-sm p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-card-foreground">
                {records.length} órdenes de compra cargadas
              </p>
              {fileName && (
                <p className="text-xs text-muted-foreground font-mono">{fileName}</p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground hover:text-destructive">
            <X className="w-4 h-4 mr-1" />
            Limpiar
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-card rounded-xl border shadow-sm overflow-hidden"
    >
      <Tabs defaultValue="file" className="w-full">
        <div className="border-b px-4 pt-3">
          <TabsList className="bg-transparent h-auto p-0 gap-4">
            <TabsTrigger
              value="file"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 px-1 text-sm"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1.5" />
              Cargar archivo
            </TabsTrigger>
            <TabsTrigger
              value="manual"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 px-1 text-sm"
            >
              <Keyboard className="w-4 h-4 mr-1.5" />
              Entrada manual
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="file" className="p-4 mt-0">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
              transition-all duration-300 ease-out
              ${isDragging
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FileUp className="w-8 h-8 text-primary/60" />
              </div>
              <div>
                <p className="text-sm font-medium text-card-foreground">
                  {isDragging ? "Suelte el archivo aquí" : "Arrastre un archivo o haga clic para seleccionar"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Formatos soportados: .xlsx, .xls, .csv
                </p>
              </div>
            </div>
          </div>

          {/* Template download + column info */}
          <div className="mt-3 flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDownloadTemplate();
              }}
              className="w-full gap-2 text-sm border-primary/30 text-primary hover:bg-primary/5"
            >
              <Download className="w-4 h-4" />
              Descargar plantilla Excel (.xlsx)
            </Button>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <p className="font-medium">Columnas requeridas (formato texto):</p>
                  <p className="mt-0.5">
                    <span className="font-mono bg-amber-100 px-1 rounded">buyer_external_code</span> (o codigo_comprador),{" "}
                    <span className="font-mono bg-amber-100 px-1 rounded">provider_external_code</span> (o codigo_proveedor),{" "}
                    <span className="font-mono bg-amber-100 px-1 rounded">purchase_order_number</span> (o numero_oc)
                  </p>
                  <p className="mt-1 text-amber-600">
                    Todas las columnas deben estar en formato texto para evitar pérdida de ceros a la izquierda.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="manual" className="p-4 mt-0">
          <Textarea
            placeholder={"Ingrese los datos separados por coma, tab o pipe (uno por línea):\n\nFormato: codigo_comprador, codigo_proveedor, numero_oc\n\nEjemplo:\n0100, 1222748, 3300293553\n0100, 1221267, 3300293554\n0230, 5001234, 4500012345"}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            className="min-h-[180px] font-mono text-xs"
          />
          <Button onClick={handleManualSubmit} className="mt-3 w-full">
            <Upload className="w-4 h-4 mr-2" />
            Cargar datos
          </Button>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
