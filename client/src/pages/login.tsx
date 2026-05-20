import { useState } from "react";
import { CreditCard, KeyRound, Loader2, ArrowRight, ArrowLeft, CheckCircle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Step = "document" | "confirm" | "code";

export default function Login() {
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("document");
  const [loading, setLoading] = useState(false);

  const [document, setDocument] = useState("");
  const [code, setCode] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [hasPhone, setHasPhone] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  // ── Step 1: check document ──────────────────────────────────
  const handleCheckDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!document.trim()) return;
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/check-document", { document: document.trim() });
      const data = await res.json();
      setCustomerName(data.name || "");
      setHasPhone(!!data.hasPhone);
      setMaskedPhone(data.maskedPhone || "");
      if (data.status === "choose_channel") {
        setIsNewUser(false);
        setStep("confirm");
      } else if (data.status === "needs_email") {
        setIsNewUser(true);
        setStep("confirm");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      const description = msg.includes("404")
        ? "Cédula no encontrada en el sistema. Verifica el número."
        : msg.includes("503")
        ? "El sistema está tardando en responder. Por favor intenta de nuevo en unos segundos."
        : "No se pudo verificar la cédula. Intenta de nuevo.";
      toast({ title: "Error", description, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: send OTP via WhatsApp ──────────────────────────
  const handleSendWhatsApp = async () => {
    setLoading(true);
    try {
      const endpoint = isNewUser ? "/api/auth/register-whatsapp" : "/api/auth/send-otp";
      const body = isNewUser
        ? { document: document.trim() }
        : { document: document.trim(), channel: "whatsapp" };
      const res = await apiRequest("POST", endpoint, body);
      const data = await res.json();
      setMaskedPhone(data.maskedEmail || maskedPhone);
      setStep("code");
      toast({ title: "Código enviado", description: `Código enviado por WhatsApp a ${data.maskedEmail || maskedPhone}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      toast({
        title: "Error",
        description: msg.includes("429")
          ? "Demasiadas solicitudes. Espera un momento."
          : "No se pudo enviar el código por WhatsApp. Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: verify OTP code ─────────────────────────────────
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/verify-otp-document", {
        document: document.trim(),
        code: code.trim(),
      });
      window.location.replace("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      const description = msg.includes("401")
        ? "Código incorrecto o expirado. Verifica e intenta de nuevo."
        : msg.includes("429")
        ? "Demasiados intentos. Espera 15 minutos."
        : "No se pudo verificar el código. Intenta de nuevo.";
      toast({ title: "Código inválido", description, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const stepIndex = step === "document" ? 0 : step === "confirm" ? 1 : 2;

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md w-full flex flex-col items-center gap-6">
        <img
          src="https://cltiene.com/wp-content/uploads/2026/03/Diseno-sin-titulo-1.gif"
          alt="CL Tiene"
          className="h-24 object-contain"
          data-testid="img-login-logo"
        />

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => {
            const isDone = i < stepIndex;
            const isActive = i === stepIndex;
            return (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${isDone ? "bg-green-500 text-white" : isActive ? "bg-[#FF8147] text-white" : "bg-gray-200 text-gray-400"}`}>
                  {isDone ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                {i < 2 && <div className={`w-8 h-0.5 ${isDone ? "bg-green-400" : "bg-gray-200"}`} />}
              </div>
            );
          })}
        </div>

        <Card className="w-full rounded-2xl border-border/50 shadow-lg">
          <CardContent className="pt-8 pb-8 px-6">

            {/* ── STEP 1: Cédula ── */}
            {step === "document" && (
              <form onSubmit={handleCheckDocument} className="space-y-5">
                <div className="space-y-2 text-center">
                  <h2 className="text-xl font-bold text-foreground" data-testid="text-login-title">
                    Iniciar Sesión
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Ingresa tu número de cédula para continuar
                  </p>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="Número de cédula"
                    className="pl-10 h-12 rounded-xl font-mono text-center tracking-wider"
                    value={document}
                    onChange={(e) => setDocument(e.target.value.replace(/\D/g, ""))}
                    required
                    autoFocus
                    data-testid="input-document"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading || document.trim().length < 6}
                  className="w-full h-12 rounded-xl font-bold bg-[#FF8147] hover:bg-[#e06530] text-white"
                  data-testid="button-check-document"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>Continuar <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </form>
            )}

            {/* ── STEP 2: Confirmar envío por WhatsApp ── */}
            {step === "confirm" && (
              <div className="space-y-5">
                <div className="space-y-1 text-center">
                  <h2 className="text-xl font-bold text-foreground" data-testid="text-confirm-title">
                    ¡Hola, {customerName || "usuario"}!
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isNewUser ? "Primera vez en el sistema." : "Bienvenido de nuevo."}
                  </p>
                </div>

                {hasPhone ? (
                  <div className="rounded-xl border-2 border-[#25D366] bg-[#25D366]/5 p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
                        <MessageCircle className="w-6 h-6 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-muted-foreground">Número registrado en el sistema</p>
                        <p className="font-bold text-xl tracking-widest text-foreground" data-testid="text-masked-phone">
                          +57 ••• ••• {maskedPhone.replace(/\D/g, "")}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      disabled={loading}
                      onClick={handleSendWhatsApp}
                      className="w-full h-12 rounded-xl font-bold bg-[#25D366] hover:bg-[#1da851] text-white text-base"
                      data-testid="button-send-whatsapp"
                    >
                      {loading
                        ? <Loader2 className="w-5 h-5 animate-spin" />
                        : <><MessageCircle className="w-5 h-5 mr-2" />Enviar código por WhatsApp</>
                      }
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-muted/40 p-5 text-center space-y-2">
                    <MessageCircle className="w-10 h-10 mx-auto text-muted-foreground/50" />
                    <p className="font-semibold text-foreground text-sm">Sin número de WhatsApp</p>
                    <p className="text-xs text-muted-foreground">
                      No encontramos un número de celular registrado en el sistema para esta cédula.
                      Comunícate con soporte para actualizarlo.
                    </p>
                  </div>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setStep("document"); setCode(""); }}
                  className="w-full text-sm text-muted-foreground"
                  data-testid="button-back-document"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" /> Cambiar cédula
                </Button>
              </div>
            )}

            {/* ── STEP 3: Código OTP ── */}
            {step === "code" && (
              <form onSubmit={handleVerifyCode} className="space-y-5">
                <div className="space-y-2 text-center">
                  <h2 className="text-xl font-bold text-foreground" data-testid="text-otp-title">
                    Verificar Código
                  </h2>
                  {customerName && (
                    <p className="text-sm font-semibold text-[#FF8147]">Hola, {customerName}</p>
                  )}
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <MessageCircle className="w-4 h-4 text-[#25D366] shrink-0" />
                    Código enviado por WhatsApp a <strong>{maskedPhone}</strong>
                  </p>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    className="pl-10 h-14 rounded-xl text-center text-2xl font-mono tracking-[0.5em]"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                    autoFocus
                    data-testid="input-otp-code"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full h-12 rounded-xl font-bold bg-[#FF8147] hover:bg-[#e06530] text-white"
                  data-testid="button-verify-otp"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verificar</>}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setStep("confirm"); setCode(""); }}
                  className="w-full text-xs text-muted-foreground hover:text-[#25D366]"
                  data-testid="button-resend-otp"
                >
                  <ArrowLeft className="w-3 h-3 mr-1" /> Reenviar código
                </Button>
              </form>
            )}

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
