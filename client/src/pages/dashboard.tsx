import { useState, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Search, Loader2, Calendar, User, Tag, Car,
  Activity, FileText, Filter, ExternalLink, Hash, PlusCircle
} from "lucide-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSearchServices, useBusinessUnits } from "@/hooks/use-services";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const STATUS_LABELS: Record<string, string> = {
  Pending: "Pendiente",
  Confirmed: "Confirmado",
  Cancelled: "Cancelado",
  InService: "En Servicio",
  Finished: "Finalizado",
};

export default function Dashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [docType, setDocType] = useState("CC");
  const [selectedBU, setSelectedBU] = useState("all");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("");

  const debouncedSearch = useDebounce(searchTerm, 600);
  // Requiere mínimo 8 caracteres para buscar
  const hasSearch = debouncedSearch.trim().length >= 8;

  const { data: buData } = useBusinessUnits();
  const { data, isLoading, error } = useSearchServices({
    subject: debouncedSearch,
    businessUnitId: selectedBU,
    status: status === "all" ? undefined : status,
    startDate: date || undefined,
    enabled: hasSearch,
  });

  const services = data?.data || [];
  const businessUnits = buData?.businessUnits || [];

  const getStatusStyle = (s: string) => {
    const v = s?.toLowerCase() ?? "";
    if (v === "confirmed" || v.includes("complet") || v.includes("finaliz"))
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (v === "pending" || v.includes("pend"))
      return "bg-amber-100 text-amber-800 border-amber-200";
    if (v === "cancelled" || v.includes("cancel"))
      return "bg-red-100 text-red-800 border-red-200";
    if (v === "inservice" || v.includes("servic"))
      return "bg-blue-100 text-blue-800 border-blue-200";
    return "bg-slate-100 text-slate-700 border-slate-200";
  };

  return (
    <div className="p-6 md:p-10 max-w-[1400px] mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6">
        <div className="flex items-start justify-between w-full xl:w-auto gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">
              Panel de Servicios
            </h1>
            <p className="text-muted-foreground mt-2 text-lg">
              Gestiona y visualiza todos los servicios agendados.
            </p>
          </div>
          <Link href="/create">
            <Button
              className="shrink-0 h-12 px-5 rounded-xl font-bold bg-[#FF8147] hover:bg-[#e06530] text-white shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2"
              data-testid="button-new-service"
            >
              <PlusCircle className="w-5 h-5" />
              <span className="hidden sm:inline">Registrar Servicio</span>
              <span className="sm:hidden">Nuevo</span>
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 w-full xl:w-auto">
          {/* Fila 1: BU + Estado + Fecha */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* BU filter */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Filter className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
              <Select value={selectedBU} onValueChange={setSelectedBU}>
                <SelectTrigger
                  className="pl-10 h-12 rounded-xl border-border bg-card shadow-sm focus:ring-primary"
                  data-testid="select-business-unit"
                >
                  <SelectValue placeholder="Unidad de Negocio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las Unidades</SelectItem>
                  {businessUnits.map((bu) => (
                    <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status filter */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Activity className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger
                  className="pl-10 h-12 rounded-xl border-border bg-card shadow-sm focus:ring-primary"
                  data-testid="select-status"
                >
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los Estados</SelectItem>
                  <SelectItem value="Pending">Pendiente</SelectItem>
                  <SelectItem value="Confirmed">Confirmado</SelectItem>
                  <SelectItem value="InService">En Servicio</SelectItem>
                  <SelectItem value="Finished">Finalizado</SelectItem>
                  <SelectItem value="Cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date filter */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
              <Input
                type="date"
                className="pl-10 h-12 rounded-xl border-border bg-card shadow-sm focus-visible:ring-primary transition-all"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="input-date"
              />
            </div>
          </div>

          {/* Fila 2: Tipo de documento + Número (ancho completo) */}
          <div className="flex gap-2">
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger
                className="h-12 w-36 rounded-xl border-border bg-card shadow-sm shrink-0"
                data-testid="select-doc-type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CC">Cédula</SelectItem>
                <SelectItem value="PA">Pasaporte</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative group flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
              <Input
                placeholder={docType === "PA" ? "Número de pasaporte..." : "Número de cédula..."}
                className="pl-10 h-12 rounded-xl border-border bg-card shadow-sm focus-visible:ring-primary w-full text-base transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary row */}
      {!isLoading && !error && hasSearch && (
        <p className="text-sm text-muted-foreground">
          {services.length === 0
            ? "No se encontraron servicios."
            : `${services.length} servicio${services.length !== 1 ? "s" : ""} encontrado${services.length !== 1 ? "s" : ""}.`}
        </p>
      )}

      {/* Table */}
      <Card className="rounded-2xl border-border/50 shadow-lg shadow-primary/5 overflow-hidden bg-white/50 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent border-b border-border/60">
                <TableHead className="py-4 px-5 text-primary font-semibold">
                  <div className="flex items-center gap-2"><Hash className="w-4 h-4" /> Expediente</div>
                </TableHead>
                <TableHead className="py-4 px-5 text-primary font-semibold">
                  <div className="flex items-center gap-2"><FileText className="w-4 h-4" /> WIP</div>
                </TableHead>
                <TableHead className="py-4 px-5 text-primary font-semibold">
                  <div className="flex items-center gap-2"><User className="w-4 h-4" /> Cliente</div>
                </TableHead>
                <TableHead className="py-4 px-5 text-primary font-semibold">
                  <div className="flex items-center gap-2"><Car className="w-4 h-4" /> Placa</div>
                </TableHead>
                <TableHead className="py-4 px-5 text-primary font-semibold">
                  <div className="flex items-center gap-2"><Tag className="w-4 h-4" /> Tipo</div>
                </TableHead>
                <TableHead className="py-4 px-5 text-primary font-semibold">
                  <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Fecha Prog.</div>
                </TableHead>
                <TableHead className="py-4 px-5 text-primary font-semibold text-right">
                  <div className="flex items-center justify-end gap-2"><Activity className="w-4 h-4" /> Estado</div>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="font-medium text-lg">Cargando servicios...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center text-destructive">
                    Ocurrió un error al cargar los datos. Intenta de nuevo.
                  </TableCell>
                </TableRow>
              ) : !hasSearch ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground gap-3">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <Search className="h-8 w-8 text-primary opacity-60" />
                      </div>
                      {searchTerm.trim().length > 0 && searchTerm.trim().length < 8 ? (
                        <>
                          <p className="font-semibold text-lg text-foreground">
                            {docType === "PA" ? "Pasaporte incompleto" : "Cédula incompleta"}
                          </p>
                          <p className="text-sm max-w-xs">
                            Escribe el número completo ({searchTerm.trim().length}/8 mínimo) para buscar.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-semibold text-lg text-foreground">
                            {docType === "PA" ? "Ingresa un pasaporte para buscar" : "Ingresa una cédula para buscar"}
                          </p>
                          <p className="text-sm max-w-xs">
                            Selecciona el tipo de documento e ingresa el número completo para ver los servicios.
                          </p>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : services.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground gap-3">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-2">
                        <Search className="h-8 w-8 opacity-40" />
                      </div>
                      <p className="font-semibold text-lg">No se encontraron servicios</p>
                      <p className="text-sm max-w-xs">
                        No hay servicios registrados para este número de cédula.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                services.map((service) => (
                  <TableRow
                    key={service.id}
                    className="hover:bg-muted/30 transition-colors border-b border-border/30"
                    data-testid={`row-service-${service.id}`}
                  >
                    <TableCell className="px-5 py-4 font-mono text-sm font-semibold text-foreground">
                      {service.expedient || "—"}
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      {service.wipExpedient ? (
                        <span className="font-mono text-xs text-primary font-bold">
                          {service.wipExpedient}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <div>
                        <p className="font-medium text-foreground leading-tight">
                          {service.finalClientName || service.userName || "—"}
                        </p>
                        {service.customerDocument && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            CC {service.customerDocument}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      {service.plate ? (
                        <Badge variant="outline" className="font-mono bg-background px-2 py-1 text-sm border-border font-bold uppercase">
                          {service.plate}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-muted-foreground text-sm max-w-[180px] truncate">
                      {service.type || "—"}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-sm">
                      {service.scheduledDate ? (
                        <span className="capitalize">
                          {format(new Date(service.scheduledDate), "dd MMM yyyy, HH:mm", { locale: es })}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Badge
                          className={`${getStatusStyle(service.status)} font-medium px-3 py-1 rounded-full shadow-none border text-xs`}
                          data-testid={`status-service-${service.id}`}
                        >
                          {STATUS_LABELS[service.status] ?? service.status ?? "Desconocido"}
                        </Badge>
                        {service.url && (
                          <a
                            href={service.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-primary transition-colors"
                            title="Ver seguimiento"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
