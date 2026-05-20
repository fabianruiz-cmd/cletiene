import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { CreateServiceInput } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export interface ServiceRecord {
  id: string;
  wipExpedient: string;
  expedient: string;
  userName: string;
  finalClientName: string;
  customerDocument: string;
  plate: string;
  type: string;
  businessUnitName: string;
  scheduledDate: string;
  createdDate: string;
  status: string;
  note: string;
  url: string;
}

export interface SearchResponse {
  data: ServiceRecord[];
  total?: number;
}

export interface ServiceType {
  id: string;
  name: string;
  formId: string;
  companyFormId: string;
}

export interface BusinessUnit {
  id: string;
  name: string;
  serviceTypes: ServiceType[];
}

export interface BusinessUnitsResponse {
  businessUnits: BusinessUnit[];
}

export function useSearchServices(params: {
  subject?: string;
  businessUnitId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  enabled?: boolean;
} = {}) {
  const { subject = "", businessUnitId = "all", status, startDate, endDate, enabled = true } = params;

  return useQuery<SearchResponse>({
    queryKey: ["/api/services/search", subject, businessUnitId, status, startDate, endDate],
    enabled,
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/services/search", {
        subject,
        businessUnitId: businessUnitId === "all" ? undefined : businessUnitId,
        status: status || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page: 1,
        pageSize: 50,
      });
      return (await res.json()) as SearchResponse;
    },
  });
}

export function useBusinessUnits() {
  return useQuery<BusinessUnitsResponse>({
    queryKey: ["/api/business-units"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/business-units");
      return (await res.json()) as BusinessUnitsResponse;
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateServiceInput) => {
      const res = await apiRequest("POST", "/api/services", data);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: "Error desconocido" }));
        throw new Error(errData.message || "Error al crear el servicio");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/services/search"] });
      toast({
        title: "Servicio Registrado",
        description: `Expediente: ${data.wipExpedient || data.id}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al registrar",
        description: error.message || "No se pudo registrar el servicio.",
        variant: "destructive",
      });
    },
  });
}
