import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createServiceSchema, type CreateServiceInput } from "@shared/schema";
import { useBusinessUnits, useCreateService } from "@/hooks/use-services";
import {
  Building2, Calendar, Car, MapPin, Navigation,
  Phone, UserCircle2, Info, Loader2, Save, Search, FileText, Mail,
  PawPrint, Users, Plus, Trash2
} from "lucide-react";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function CreateService() {
  const [, setLocation] = useLocation();
  const { data: buData, isLoading: buLoading } = useBusinessUnits();
  const createMutation = useCreateService();
  const { toast } = useToast();

  const [consultando, setConsultando] = useState(false);
  const [conDestino, setConDestino] = useState(false);
  const [planes, setPlanes] = useState<{ label: string; value: string }[]>([]);
  const [planBuMap, setPlanBuMap] = useState<Map<string, Set<string>>>(new Map());
  const [docType, setDocType] = useState("CC");
  const [availableServicesByBu, setAvailableServicesByBu] = useState<Map<string, { name: string; formId: string; companyFormId: string }[]>>(new Map());
  const [consumptionLoaded, setConsumptionLoaded] = useState(false);
  const [foundCustomerId, setFoundCustomerId] = useState<string | null>(null);

  const allBusinessUnits = buData?.businessUnits || [];

  const form = useForm<CreateServiceInput>({
    resolver: zodResolver(createServiceSchema),
    defaultValues: {
      userName: "",
      userPhone: "",
      businessUnitId: "",
      businessUnitName: "",
      plate: "",
      finalClientName: "",
      customerDocument: "",
      customerDocType: "CC",
      customerEmail: "",
      userClientePhone: "",
      customerBirthdate: "",
      customerSex: "",
      customerCivilStatus: "",
      customerZipCode: "",
      customerAddress: "",
      scheduledDate: "",
      type: "",
      note: "",
      formId: "",
      companyFormId: "",
      customerId: null,
      estadoPago: "",
      cuentaBase: "",
      whereTo: { address: "", city: "", otherInfo: "" },
      fromWhere: { address: "", city: "", otherInfo: "" },
      petType: "",
      petName: "",
      petBreed: "",
      petSex: "",
      petAge: "",
      petColor: "",
      petSize: "",
      vehicleType: "",
      vehicleBrand: "",
      vehicleColor: "",
      beneficiaries: [],
    },
  });

  const { fields: benefFields, append: appendBenef, remove: removeBenef } = useFieldArray({
    control: form.control,
    name: "beneficiaries",
  });

  const selectedPlan = form.watch("cuentaBase");

  // Filtra las BUs según el plan seleccionado
  const allowedBuIds = selectedPlan && planBuMap.has(selectedPlan)
    ? planBuMap.get(selectedPlan)!
    : null;
  const businessUnits = allowedBuIds
    ? allBusinessUnits.filter((bu) => allowedBuIds.has(bu.id))
    : allBusinessUnits;

  const selectedBuId = form.watch("businessUnitId");
  const selectedBu = businessUnits.find((bu) => bu.id === selectedBuId);
  const allServiceTypes = selectedBu?.serviceTypes || [];
  const buNameUpper = (selectedBu?.name || "").toUpperCase();
  const isMascotaBu = buNameUpper.includes("MASCOTA");
  const isVialBu = buNameUpper.includes("VIAL");
  const serviceTypes = consumptionLoaded && selectedBuId && availableServicesByBu.has(selectedBuId)
    ? availableServicesByBu.get(selectedBuId)!
    : allServiceTypes;

  // Cuando cambia el plan, si la BU seleccionada no pertenece al nuevo plan, resetearla
  useEffect(() => {
    if (!selectedPlan) return;
    const buSet = planBuMap.get(selectedPlan);
    if (buSet && selectedBuId && !buSet.has(selectedBuId)) {
      form.setValue("businessUnitId", "");
      form.setValue("businessUnitName", "");
      form.setValue("type", "");
      form.setValue("formId", "");
      form.setValue("companyFormId", "");
    }
  }, [selectedPlan]);

  useEffect(() => {
    if (selectedBu) {
      form.setValue("businessUnitName", selectedBu.name);
      form.setValue("type", "");
      form.setValue("formId", "");
      form.setValue("companyFormId", "");
    }
  }, [selectedBuId, selectedBu, form]);

  const handleConsultar = async () => {
    const doc = form.getValues("customerDocument")?.trim();
    if (!doc || doc.length < 8) {
      const label = docType === "PA" ? "pasaporte" : "cédula";
      toast({ title: "Documento incompleto", description: `Escribe al menos 8 caracteres del ${label} para consultar.`, variant: "destructive" });
      return;
    }
    setConsultando(true);
    setPlanes([]);
    setPlanBuMap(new Map());
    setAvailableServicesByBu(new Map());
    setConsumptionLoaded(false);
    setFoundCustomerId(null);
    form.setValue("cuentaBase", "");
    form.setValue("businessUnitId", "");
    form.setValue("businessUnitName", "");
    try {
      // Busca datos del cliente en servicios y suscripciones en paralelo
      const [svcRes, subRes] = await Promise.all([
        fetch("/api/services/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: doc, businessUnitId: "all" }),
        }),
        fetch(`/api/subscriptions?searchTerm=${encodeURIComponent(doc)}`),
      ]);

      // ── Datos del cliente desde servicios ──
      const svcData = await svcRes.json();
      const servicios: any[] = svcData?.data || [];
      const exacto = servicios.find((s) => s.customerDocument?.trim() === doc) || servicios[0];

      if (exacto && exacto.finalClientName) {
        form.setValue("finalClientName", exacto.finalClientName);
        if (exacto.userClientePhone && exacto.userClientePhone !== "0" && exacto.userClientePhone !== "0000") {
          form.setValue("userClientePhone", exacto.userClientePhone);
        }
        const emailFromData = exacto.fields?.["Correo electrónico"] || exacto.fields?.["Email"] || exacto.fields?.["email"] || exacto.customerEmail || "";
        if (emailFromData && !form.getValues("customerEmail")) {
          form.setValue("customerEmail", emailFromData);
        }
      }

      // ── Planes: desde los fields de los servicios encontrados ──
      // Cada servicio tiene fields["Name subscription"], fields["Code"], businessUnitId
      const planesMap = new Map<string, { nombre: string; codigo: string; cantidad: string }>();
      const newPlanBuMap = new Map<string, Set<string>>();
      for (const svc of servicios) {
        const fields = svc.fields || {};
        const nombre = fields["Name subscription"] || fields["name subscription"] || fields["Subscription"] || "";
        const codigo = fields["Code"] || fields["code"] || fields["PlanCode"] || "";
        const buId: string = svc.businessUnitId || "";
        if (nombre) {
          if (!planesMap.has(nombre)) planesMap.set(nombre, { nombre, codigo, cantidad: "" });
          // Registrar qué BUs corresponden a este plan
          if (buId) {
            if (!newPlanBuMap.has(nombre)) newPlanBuMap.set(nombre, new Set());
            newPlanBuMap.get(nombre)!.add(buId);
          }
        }
      }

      // ── Enriquecer con datos del API de suscripciones ──
      // La suscripción trae: businessUnitIds[], additionalData.{Code, "Name subscription"}
      try {
        const subData = await subRes.json();
        const rawSubs: any[] = Array.isArray(subData) ? subData.flat().filter(Boolean) : [];
        // Deduplicar por id
        const uniqueSubs = Array.from(new Map(rawSubs.map((s) => [s?.id, s])).values()).filter(Boolean);
        for (const s of uniqueSubs) {
          const nombre = s.additionalData?.["Name subscription"] || s.planName || s.name || "";
          const codigo = s.additionalData?.["Code"] || s.shortName || s.code || "";
          const buIds: string[] = s.businessUnitIds || [];
          if (nombre) {
            // Actualizar datos del plan en planesMap
            const existing = planesMap.get(nombre);
            if (existing) {
              planesMap.set(nombre, { ...existing, codigo: existing.codigo || codigo });
            } else {
              planesMap.set(nombre, { nombre, codigo, cantidad: "" });
            }
            // Registrar BUs desde la suscripción (fuente más precisa)
            if (buIds.length > 0) {
              if (!newPlanBuMap.has(nombre)) newPlanBuMap.set(nombre, new Set());
              buIds.forEach((id) => newPlanBuMap.get(nombre)!.add(id));
            }
          }
        }
      } catch { /* subscriptions API error is non-fatal */ }

      const planesFormateados = Array.from(planesMap.values()).map(({ nombre, codigo, cantidad }) => {
        const label = [
          nombre,
          codigo ? `(${codigo})` : "",
          cantidad ? `(${cantidad} servicios)` : "",
        ].filter(Boolean).join(" ");
        return { label, value: nombre };
      });

      if (planesFormateados.length > 0) {
        setPlanes(planesFormateados);
        setPlanBuMap(newPlanBuMap);
        if (planesFormateados.length === 1) {
          form.setValue("cuentaBase", planesFormateados[0].value);
          // Si solo hay una BU para ese plan, preseleccionarla también
          const buSet = newPlanBuMap.get(planesFormateados[0].value);
          if (buSet && buSet.size === 1) {
            const buId = [...buSet][0];
            const bu = allBusinessUnits.find((b) => b.id === buId);
            if (bu) {
              form.setValue("businessUnitId", bu.id);
              form.setValue("businessUnitName", bu.name);
            }
          }
        }
      }

      if (exacto && exacto.finalClientName) {
        const custId = exacto.customerId || exacto.id || null;
        if (custId) {
          setFoundCustomerId(custId);
          form.setValue("customerId", custId);
        }

        toast({
          title: "Cliente encontrado",
          description: `${exacto.finalClientName}${planesFormateados.length > 0 ? ` — ${planesFormateados.length} plan(es)` : ""}`,
        });

        if (custId) {
          const buIdsToQuery = new Set<string>();
          newPlanBuMap.forEach((buSet) => buSet.forEach((id) => buIdsToQuery.add(id)));
          if (buIdsToQuery.size === 0) {
            allBusinessUnits.forEach((bu) => buIdsToQuery.add(bu.id));
          }

          try {
            const consumptionResults = await Promise.all(
              Array.from(buIdsToQuery).map(async (buId) => {
                try {
                  const r = await fetch("/api/subscriptions/consumption", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ customerId: custId, businessUnitId: buId }),
                  });
                  if (!r.ok) return { buId, success: false as const, services: [] };
                  const data = await r.json();
                  const items: any[] = Array.isArray(data) ? data : data?.typeServices || data?.services || [];
                  const allowed = items.filter(
                    (s: any) => s.availability === true && s.enabled === true && (s.serviceLimit ?? 0) > (s.consumption ?? 0)
                  );
                  const allowedIds = new Set(allowed.map((s: any) => s.id).filter(Boolean));
                  const allowedNames = new Set(allowed.map((s: any) => (s.name as string)?.trim()?.toLowerCase()).filter(Boolean));
                  const buDef = allBusinessUnits.find((b) => b.id === buId);
                  const filtered = (buDef?.serviceTypes || []).filter(
                    (st) => allowedIds.has(st.formId) || allowedNames.has(st.name?.trim()?.toLowerCase())
                  );
                  return {
                    buId,
                    success: true as const,
                    services: filtered,
                  };
                } catch {
                  return { buId, success: false as const, services: [] };
                }
              })
            );

            const newMap = new Map<string, { name: string; formId: string; companyFormId: string }[]>();
            let anySuccess = false;
            for (const r of consumptionResults) {
              if (r.success) {
                newMap.set(r.buId, r.services);
                anySuccess = true;
              }
            }
            if (anySuccess) {
              setAvailableServicesByBu(newMap);
              setConsumptionLoaded(true);
            }
          } catch { /* consumption fetch non-fatal — fallback to all service types */ }
        }
      } else {
        toast({ title: "Sin resultados", description: "No se encontraron registros para esa cédula.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de consulta", description: "No se pudo conectar al servidor.", variant: "destructive" });
    } finally {
      setConsultando(false);
    }
  };

  const onSubmit = async (data: CreateServiceInput) => {
    await createMutation.mutateAsync(data);
    setLocation("/dashboard");
  };

  const inputClass = "h-12 rounded-xl bg-slate-50 border-slate-200 focus:bg-white text-sm";

  return (
    <div className="p-4 md:p-8 max-w-[860px] mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">

      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
            <Building2 className="w-6 h-6" />
          </div>
          Agendar Nuevo Servicio
        </h1>
        <p className="text-muted-foreground mt-2 text-sm ml-12">
          Complete los detalles para registrar un nuevo servicio en el sistema.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pb-24">

          {/* ── DATOS DEL SOLICITANTE Y CLIENTE ── */}
          <Card className="rounded-2xl border border-slate-200 shadow-sm">
            <CardHeader className="pb-4 pt-5 px-6">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-primary">
                <UserCircle2 className="w-5 h-5" /> Datos del Solicitante y Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">

              {/* Tipo de documento + Número + Consultar */}
              <FormField
                control={form.control}
                name="customerDocument"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-foreground">
                      Documento <span className="text-destructive">*</span>
                    </FormLabel>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Select value={docType} onValueChange={(v) => { setDocType(v); form.setValue("customerDocType", v); }}>
                          <SelectTrigger
                            className="h-12 w-36 rounded-xl border-border bg-background shrink-0"
                            data-testid="select-doc-type"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CC">Cédula</SelectItem>
                            <SelectItem value="PA">Pasaporte</SelectItem>
                            <SelectItem value="CE">Cédula Extranjería</SelectItem>
                            <SelectItem value="NIT">NIT</SelectItem>
                            <SelectItem value="TI">Tarjeta de Identidad</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormControl>
                          <Input
                            placeholder={docType === "PA" ? "Número de pasaporte" : "Ej. 1000988807"}
                            className={`${inputClass} flex-1`}
                            data-testid="input-document"
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleConsultar())}
                            {...field}
                          />
                        </FormControl>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleConsultar}
                        disabled={consultando || !form.watch("customerDocument")}
                        className="h-12 w-full rounded-xl border-primary text-primary hover:bg-primary/5 font-semibold"
                        data-testid="button-consultar"
                      >
                        {consultando
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <><Search className="w-4 h-4 mr-1.5" /> Consultar</>
                        }
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Nombre Cliente Final | Teléfono Cliente */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="finalClientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground">
                        Nombre Cliente Final <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. Juan García" className={inputClass} data-testid="input-client-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="userClientePhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground">Teléfono Cliente</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. 310 987 6543" className={inputClass} data-testid="input-client-phone" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Correo Electrónico del Cliente */}
              <FormField
                control={form.control}
                name="customerEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" /> Correo Electrónico del Cliente
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="Ej. cliente@correo.com"
                        className={inputClass}
                        data-testid="input-client-email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Titular extra: birthdate, sex, civil status */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="customerBirthdate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-foreground">Fecha de Nacimiento</FormLabel>
                    <FormControl>
                      <Input type="date" className={inputClass} data-testid="input-customer-birthdate" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="customerSex" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-foreground">Sexo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className={`${inputClass} w-full`} data-testid="select-customer-sex">
                          <SelectValue placeholder="Seleccione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="M">Masculino</SelectItem>
                        <SelectItem value="F">Femenino</SelectItem>
                        <SelectItem value="O">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="customerCivilStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-foreground">Estado Civil</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className={`${inputClass} w-full`} data-testid="select-civil-status">
                          <SelectValue placeholder="Seleccione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Soltero/a">Soltero/a</SelectItem>
                        <SelectItem value="Casado/a">Casado/a</SelectItem>
                        <SelectItem value="Unión libre">Unión libre</SelectItem>
                        <SelectItem value="Divorciado/a">Divorciado/a</SelectItem>
                        <SelectItem value="Viudo/a">Viudo/a</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Dirección + Código postal del titular */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <FormField control={form.control} name="customerAddress" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Dirección del Titular
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. Calle 80 # 45-23, Bogotá" className={inputClass} data-testid="input-customer-address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="customerZipCode" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-foreground">Código Postal</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. 110111" className={inputClass} data-testid="input-customer-zipcode" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Nombre quien reporta | Teléfono quien reporta */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="userName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground">
                        Nombre de quien reporta <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. Juan Pérez" className={inputClass} data-testid="input-username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="userPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground" /> Teléfono de quien reporta
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. 300 123 4567" className={inputClass} data-testid="input-user-phone" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

            </CardContent>
          </Card>

          {/* ── INFORMACIÓN GENERAL ── */}
          <Card className="rounded-2xl border border-slate-200 shadow-sm">
            <CardHeader className="pb-4 pt-5 px-6">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-primary">
                <Info className="w-5 h-5" /> Información General
              </CardTitle>
              <CardDescription className="text-xs">Seleccione la unidad de negocio y fecha del servicio</CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Plan de Suscripción Activo (cuentaBase) */}
                <FormField
                  control={form.control}
                  name="cuentaBase"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground">Plan de Suscripción Activo</FormLabel>
                      {planes.length > 0 ? (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className={`${inputClass} w-full`} data-testid="select-cuenta-base">
                              <SelectValue placeholder="Seleccione un plan..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {planes.map((p, i) => (
                              <SelectItem key={i} value={p.value}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <FormControl>
                          <Input
                            placeholder="Consulta la cédula para ver los planes"
                            className={`${inputClass} text-muted-foreground`}
                            data-testid="input-cuenta-base"
                            readOnly
                            value={field.value}
                            onClick={() => {}}
                          />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Unidad de Negocio */}
                <FormField
                  control={form.control}
                  name="businessUnitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground">
                        Unidad de Negocio <span className="text-destructive">*</span>
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className={`${inputClass} w-full`} data-testid="select-bu">
                            <SelectValue placeholder={buLoading ? "Cargando..." : "Seleccione una unidad..."} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {businessUnits.map((bu) => (
                            <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tipo de Servicio */}
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground">
                        Tipo de Servicio <span className="text-destructive">*</span>
                      </FormLabel>
                      <Select
                        disabled={!selectedBuId || serviceTypes.length === 0}
                        onValueChange={(val) => {
                          field.onChange(val);
                          const sType = serviceTypes.find((t) => t.name === val);
                          if (sType) {
                            form.setValue("formId", sType.formId);
                            form.setValue("companyFormId", sType.companyFormId);
                          }
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className={`${inputClass} w-full`} data-testid="select-service-type">
                            <SelectValue placeholder={!selectedBuId ? "Seleccione primero la Unidad" : serviceTypes.length === 0 ? "Sin servicios disponibles" : "Seleccione el tipo..."} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {serviceTypes.map((st) => (
                            <SelectItem key={st.formId} value={st.name}>{st.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedBuId && serviceTypes.length === 0 && consumptionLoaded && (
                        <p className="text-xs text-amber-600 mt-1" data-testid="text-no-services">
                          Este cliente no tiene servicios disponibles en esta unidad de negocio.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Fecha Programada */}
                <FormField
                  control={form.control}
                  name="scheduledDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        Fecha Programada <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input type="datetime-local" className={inputClass} data-testid="input-scheduled-date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

            </CardContent>
          </Card>

          {/* ── MASCOTA / VEHÍCULO (dinámica según BU) ── */}
          {(isMascotaBu || isVialBu) && (
          <Card className="rounded-2xl border border-slate-200 shadow-sm">
            <CardHeader className="pb-4 pt-5 px-6">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-primary">
                {isMascotaBu ? <><PawPrint className="w-5 h-5" /> Datos de la Mascota</> : <><Car className="w-5 h-5" /> Datos del Vehículo</>}
              </CardTitle>
              <CardDescription className="text-xs">
                {isMascotaBu ? "Completa los datos de la mascota involucrada en el servicio" : "Completa los datos del vehículo involucrado en el servicio"}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">

              {/* ── Contenido MASCOTAS ── */}
              {isMascotaBu && (<>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="petType" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className={`${inputClass} w-full`} data-testid="select-pet-type">
                          <SelectValue placeholder="Seleccione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Perro">Perro</SelectItem>
                        <SelectItem value="Gato">Gato</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="petName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Rocky" className={inputClass} data-testid="input-pet-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="petBreed" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Raza</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Labrador" className={inputClass} data-testid="input-pet-breed" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="petSex" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Sexo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className={`${inputClass} w-full`} data-testid="select-pet-sex">
                          <SelectValue placeholder="Seleccione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="M">Macho</SelectItem>
                        <SelectItem value="F">Hembra</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="petAge" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Edad</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. 3 años" className={inputClass} data-testid="input-pet-age" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="petColor" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Color</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Café y blanco" className={inputClass} data-testid="input-pet-color" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="petSize" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Tamaño</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className={`${inputClass} w-full`} data-testid="select-pet-size">
                          <SelectValue placeholder="Seleccione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Pequeño">Pequeño</SelectItem>
                        <SelectItem value="Mediano">Mediano</SelectItem>
                        <SelectItem value="Grande">Grande</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              </>)}

              {/* ── Contenido VIAL ── */}
              {isVialBu && (<>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="vehicleType" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className={`${inputClass} w-full`} data-testid="select-vehicle-type">
                          <SelectValue placeholder="Seleccione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Automóvil">Automóvil</SelectItem>
                        <SelectItem value="Camioneta">Camioneta</SelectItem>
                        <SelectItem value="Motocicleta">Motocicleta</SelectItem>
                        <SelectItem value="Camión">Camión</SelectItem>
                        <SelectItem value="Bus">Bus</SelectItem>
                        <SelectItem value="Otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="plate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Placa</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. ABC-123" className={`${inputClass} font-mono uppercase`} data-testid="input-plate" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="vehicleBrand" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Marca</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Chevrolet, Renault..." className={inputClass} data-testid="input-vehicle-brand" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="vehicleColor" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Color</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Blanco" className={inputClass} data-testid="input-vehicle-color" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              </>)}

            </CardContent>
          </Card>
          )}

          {/* ── TOGGLE TRASLADO ── */}
          <Card className="rounded-2xl border border-slate-200 shadow-sm">
            <CardContent className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">¿Este servicio requiere traslado de un punto a otro?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Activa destino para servicios tipo grúa, traslados o desplazamientos.</p>
                </div>
                <div className="flex items-center gap-3">
                  {conDestino && <span className="text-xs font-medium text-primary">Destino</span>}
                  <Switch
                    checked={conDestino}
                    onCheckedChange={setConDestino}
                    data-testid="switch-destino"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── DIRECCIONES ── */}
          <div className={`grid gap-4 transition-all duration-300 ${conDestino ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
            {/* Origen */}
            <Card className="rounded-2xl border border-slate-200 shadow-sm">
              <CardHeader className="pb-3 pt-5 px-6">
                <CardTitle className="text-base font-bold flex items-center gap-2 text-primary">
                  <MapPin className="w-4 h-4" /> Origen (Desde)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6 space-y-3">
                <FormField control={form.control} name="fromWhere.address" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">
                      Dirección a Visitar <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Calle 100 # 45-20" className={inputClass} data-testid="input-from-address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="fromWhere.city" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Ciudad <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Bogotá - Cundinamarca" className={inputClass} data-testid="input-from-city" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="fromWhere.otherInfo" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Detalles Adicionales</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Conjunto residencial, torre 2..." className={inputClass} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            {/* Destino — solo si toggle activo */}
            {conDestino && (
              <Card className="rounded-2xl border border-slate-200 shadow-sm">
                <CardHeader className="pb-3 pt-5 px-6">
                  <CardTitle className="text-base font-bold flex items-center gap-2 text-primary">
                    <Navigation className="w-4 h-4" /> Destino (Hacia)
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-3">
                  <FormField control={form.control} name="whereTo.address" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold">Dirección</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. Av. Siempre Viva 123" className={inputClass} data-testid="input-to-address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="whereTo.city" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold">Ciudad</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. Medellín - Antioquia" className={inputClass} data-testid="input-to-city" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="whereTo.otherInfo" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold">Detalles Adicionales</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. Bodega principal, sótano sur..." className={inputClass} data-testid="input-to-details" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── INFORMACIÓN ADICIONAL ── */}
          <Card className="rounded-2xl border border-slate-200 shadow-sm">
            <CardHeader className="pb-4 pt-5 px-6">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-primary">
                <FileText className="w-5 h-5" /> Información Adicional del Servicio
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="estadoPago" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Estado de Pago</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Confirmado" className={inputClass} data-testid="input-estado-pago" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="note" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold">Notas / Observaciones</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Escriba cualquier detalle o instrucción especial..."
                      className="min-h-[90px] rounded-xl bg-slate-50 border-slate-200 focus:bg-white resize-none text-sm"
                      data-testid="textarea-note"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

            </CardContent>
          </Card>

          {/* ── BENEFICIARIOS ── */}
          <Card className="rounded-2xl border border-slate-200 shadow-sm">
            <CardHeader className="pb-4 pt-5 px-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2 text-primary">
                    <Users className="w-5 h-5" /> Beneficiarios
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">Opcional — agrega los beneficiarios del plan</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-primary text-primary hover:bg-primary/5 font-semibold h-9"
                  data-testid="button-add-beneficiary"
                  onClick={() => appendBenef({ name: "", docType: "CC", docNumber: "", birthdate: "", sex: "", relationship: "", address: "", city: "", email: "" })}
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Agregar
                </Button>
              </div>
            </CardHeader>
            {benefFields.length > 0 && (
              <CardContent className="px-6 pb-6 space-y-6">
                {benefFields.map((bf, idx) => (
                  <div key={bf.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3 relative">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-foreground">Beneficiario #{idx + 1}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 rounded-lg"
                        data-testid={`button-remove-beneficiary-${idx}`}
                        onClick={() => removeBenef(idx)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <FormField control={form.control} name={`beneficiaries.${idx}.name`} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Nombre completo</FormLabel>
                          <FormControl><Input placeholder="Ej. María García" className={inputClass} data-testid={`input-benef-name-${idx}`} {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`beneficiaries.${idx}.relationship`} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Parentesco</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className={`${inputClass} w-full`} data-testid={`select-benef-rel-${idx}`}>
                                <SelectValue placeholder="Seleccione..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Cónyuge">Cónyuge</SelectItem>
                              <SelectItem value="Hijo/a">Hijo/a</SelectItem>
                              <SelectItem value="Padre/Madre">Padre/Madre</SelectItem>
                              <SelectItem value="Hermano/a">Hermano/a</SelectItem>
                              <SelectItem value="Otro">Otro</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <FormField control={form.control} name={`beneficiaries.${idx}.docType`} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Tipo doc.</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className={`${inputClass} w-full`} data-testid={`select-benef-doctype-${idx}`}>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="CC">Cédula</SelectItem>
                              <SelectItem value="TI">Tarjeta de Identidad</SelectItem>
                              <SelectItem value="CE">Cédula Extranjería</SelectItem>
                              <SelectItem value="PA">Pasaporte</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`beneficiaries.${idx}.docNumber`} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Número de doc.</FormLabel>
                          <FormControl><Input placeholder="Ej. 1023456789" className={inputClass} data-testid={`input-benef-doc-${idx}`} {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`beneficiaries.${idx}.birthdate`} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Fecha de nacimiento</FormLabel>
                          <FormControl><Input type="date" className={inputClass} data-testid={`input-benef-birth-${idx}`} {...field} /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <FormField control={form.control} name={`beneficiaries.${idx}.sex`} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Sexo</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className={`${inputClass} w-full`} data-testid={`select-benef-sex-${idx}`}>
                                <SelectValue placeholder="Seleccione..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="M">Masculino</SelectItem>
                              <SelectItem value="F">Femenino</SelectItem>
                              <SelectItem value="O">Otro</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`beneficiaries.${idx}.city`} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Ciudad</FormLabel>
                          <FormControl><Input placeholder="Ej. Bogotá" className={inputClass} data-testid={`input-benef-city-${idx}`} {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`beneficiaries.${idx}.email`} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Correo</FormLabel>
                          <FormControl><Input type="email" placeholder="Ej. correo@mail.com" className={inputClass} data-testid={`input-benef-email-${idx}`} {...field} /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name={`beneficiaries.${idx}.address`} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold">Dirección</FormLabel>
                        <FormControl><Input placeholder="Ej. Cra 7 # 45-10, Bogotá" className={inputClass} data-testid={`input-benef-address-${idx}`} {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                ))}
              </CardContent>
            )}
          </Card>

          {/* ── BOTONES ── */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 px-6 rounded-xl font-semibold border-[#FF8147] text-[#FF8147] hover:bg-[#FF8147]/10"
              onClick={() => setLocation("/dashboard")}
              disabled={createMutation.isPending}
              data-testid="button-cancel"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="h-12 px-8 rounded-xl font-bold bg-[#FF8147] hover:bg-[#e06530] text-white shadow-md"
              disabled={createMutation.isPending}
              data-testid="button-submit"
            >
              {createMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando...</>
                : <><Save className="w-4 h-4 mr-2" /> Registrar Servicio</>
              }
            </Button>
          </div>

        </form>
      </Form>
    </div>
  );
}
