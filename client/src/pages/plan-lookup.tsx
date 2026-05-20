import { useState } from "react";
import { Search, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function extractName(raw: any): string {
  if (!raw) return "";
  const items: any[] = Array.isArray(raw) ? raw : [raw];
  for (const item of items) {
    if (!item) continue;
    const name = item.customerName || item.customer?.name || item.name || "";
    if (name) return name;
  }
  return "";
}

export default function PlanLookup() {
  const [cedula, setCedula] = useState("");
  const [loading, setLoading] = useState(false);
  const [nombre, setNombre] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const { toast } = useToast();

  const handleSearch = async () => {
    const term = cedula.trim();
    if (!term) return;
    setLoading(true);
    setSearched(false);
    setNombre(null);
    try {
      const res = await fetch(`/api/subscriptions?searchTerm=${encodeURIComponent(term)}`);
      const data = await res.json();
      const name = extractName(data);
      setNombre(name || null);
      setSearched(true);
    } catch {
      toast({ title: "Error al consultar", description: "No se pudo conectar al servidor.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-gradient-to-b from-primary/5 via-background to-background px-4 pt-12 pb-24">

      {/* Logo */}
      <img
        src="https://cltiene.com/wp-content/uploads/2025/10/logo-CL.png"
        alt="CL Tiene"
        className="h-16 object-contain mb-2"
        data-testid="img-logo"
      />
      <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest mb-10">
        Consulta tu plan
      </p>

      {/* Buscador */}
      <div className="w-full max-w-sm">
        <div className="flex gap-2">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="Escribe tu número de cédula"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            onKeyDown={handleKey}
            className="h-12 text-base rounded-xl border-2 border-border focus:border-primary"
            data-testid="input-cedula"
          />
          <Button
            onClick={handleSearch}
            disabled={loading || !cedula.trim()}
            className="h-12 px-5 rounded-xl font-bold bg-primary hover:bg-primary/90 shrink-0"
            data-testid="button-search"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          </Button>
        </div>

        {/* Instrucción inicial */}
        {!searched && !loading && (
          <p className="text-center text-muted-foreground text-sm mt-6">
            Ingresa tu cédula para verificar si estás registrado.
          </p>
        )}

        {/* Resultado: encontrado */}
        {searched && nombre && (
          <div className="mt-8 flex flex-col items-center gap-3 text-center animate-in fade-in slide-in-from-bottom-4 duration-400">
            <CheckCircle2 className="w-14 h-14 text-primary" />
            <p className="text-muted-foreground text-sm">Registrado como</p>
            <p className="text-2xl font-extrabold text-foreground leading-tight" data-testid="text-nombre">
              {nombre}
            </p>
          </div>
        )}

        {/* Resultado: no encontrado */}
        {searched && !nombre && (
          <div className="mt-8 flex flex-col items-center gap-3 text-center animate-in fade-in slide-in-from-bottom-4 duration-400">
            <XCircle className="w-14 h-14 text-muted-foreground/40" />
            <p className="font-semibold text-foreground text-lg">No encontramos tu registro</p>
            <p className="text-muted-foreground text-sm max-w-xs">
              La cédula <strong>{cedula}</strong> no tiene un plan activo. Comunícate con CL Tiene.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
