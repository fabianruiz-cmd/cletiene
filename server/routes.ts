import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { api } from "@shared/routes";
import { z } from "zod";

declare module "express-session" {
  interface SessionData {
    userId: number;
    wipValidatedDoc: string;
    wipValidatedName: string;
    wipValidatedPhone: string;
  }
}

const WIP_BASE_URL = "https://api.wiptool.com";
const WIP_API_KEY  = "xWjGb5Zt84g4YEBEe4C8ZxNWkVswJg7ZRbkLwJeQ";
const COMPANY_ID   = "67379dff213b73f99523f061";
const USER_ID      = "67a0dcadba440e5f0db90ccc";

const WHAPI_TOKEN  = "WwW3UAz2x6iJ0nasEd7ar5WFoVsxnGpc";
const WHAPI_URL    = process.env.WHAPI_URL || "https://gate.whapi.cloud/";
const WHAPI_SENDER = process.env.WHAPI_SENDER || "573185159138";
const OWNER_ID     = "67379dff213b73f99523f061";
const BU_OWNER_ID  = "67379dff213b73f99523f061";
const OWNER_NAME   = "MULTISERVICIOS CL TIENE";

const wipHeaders = {
  'Authorization': WIP_API_KEY,
  'Content-Type': 'application/json',
};

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "No autorizado" });
  }
  next();
}

function generateOtp(): string {
  const bytes = crypto.randomBytes(3);
  const num = (bytes[0] * 65536 + bytes[1] * 256 + bytes[2]) % 900000 + 100000;
  return num.toString();
}

const otpRateLimit = new Map<string, { count: number; resetAt: number }>();
const OTP_RATE_WINDOW = 60_000;
const OTP_RATE_MAX = 3;

const verifyAttempts = new Map<string, { count: number; blockedUntil: number }>();
const VERIFY_MAX_ATTEMPTS = 5;
const VERIFY_BLOCK_DURATION = 15 * 60_000;

function checkOtpRate(key: string): boolean {
  const now = Date.now();
  const entry = otpRateLimit.get(key);
  if (!entry || now > entry.resetAt) {
    otpRateLimit.set(key, { count: 1, resetAt: now + OTP_RATE_WINDOW });
    return true;
  }
  if (entry.count >= OTP_RATE_MAX) return false;
  entry.count++;
  return true;
}

function checkVerifyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = verifyAttempts.get(key);
  if (entry && now < entry.blockedUntil) return false;
  if (!entry || now > entry.blockedUntil) {
    verifyAttempts.set(key, { count: 1, blockedUntil: 0 });
    return true;
  }
  entry.count++;
  if (entry.count > VERIFY_MAX_ATTEMPTS) {
    entry.blockedUntil = now + VERIFY_BLOCK_DURATION;
    return false;
  }
  return true;
}

function resetVerifyAttempts(key: string) {
  verifyAttempts.delete(key);
}

const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
let smtpTransporter: nodemailer.Transporter | null = null;

if (smtpUser && smtpPass) {
  smtpTransporter = nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  });
  smtpTransporter.verify()
    .then(() => console.log("[auth] SMTP conectado correctamente"))
    .catch((err: unknown) => {
      console.error("[auth] Error verificando SMTP:", err instanceof Error ? err.message : err);
      smtpTransporter = null;
    });
} else {
  console.warn("[auth] SMTP_USER / SMTP_PASS no configurados — los correos OTP no se enviarán");
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ----------------------------------------------------------
  // AUTH ENDPOINTS
  // ----------------------------------------------------------

  // Cache BU list for 10 minutes to avoid repeated calls
  let buCache: { id: string; name: string }[] | null = null;
  let buCacheAt = 0;

  async function getBusinessUnits(): Promise<{ id: string; name: string }[]> {
    if (buCache && Date.now() - buCacheAt < 10 * 60 * 1000) return buCache;
    const buRes = await fetch(
      `${WIP_BASE_URL}/business/api/v1/BusinessUnit/company/${COMPANY_ID}/business-units/services`,
      { headers: wipHeaders }
    );
    if (!buRes.ok) return [];
    const buData = await buRes.json();
    buCache = buData.businessUnits || [];
    buCacheAt = Date.now();
    return buCache!;
  }

  // Pre-warm BU cache at startup so the first login is instant
  getBusinessUnits().then((bus) =>
    console.log(`[wiptool] BU cache listo: ${bus.length} unidades`)
  ).catch(() => {});

  // Parse list from any WipTool response shape
  function parseSubList(data: any): any[] {
    return Array.isArray(data) ? data
      : Array.isArray(data?.customers) ? data.customers
      : Array.isArray(data?.subscriptions) ? data.subscriptions : [];
  }

  // Fetch one BU with a 12-second timeout; throws "timeout" error on abort
  async function fetchOneBu(buId: string, document: string): Promise<any[]> {
    const url = `${WIP_BASE_URL}/Customer/api/v1/Customer/Subscription?companyId=${COMPANY_ID}&businessUnitId=${buId}&searchTerm=${encodeURIComponent(document)}`;
    try {
      const r = await fetch(url, { headers: wipHeaders, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return [];
      return parseSubList(await r.json());
    } catch (e: any) {
      const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError";
      throw isTimeout ? Object.assign(new Error("timeout"), { isTimeout: true }) : e;
    }
  }

  // Fast check: resolves as soon as ANY BU returns a match (for login speed)
  // Returns null when not found, "timeout" string when WipTool is unreachable
  async function findWipCustomerFast(document: string): Promise<any[] | null | "timeout"> {
    try {
      const bus = await getBusinessUnits();
      if (!bus.length) return null;

      let timeoutCount = 0;
      const first = await Promise.any(
        bus.map(async (bu) => {
          try {
            const items = await fetchOneBu(bu.id, document);
            if (items.length === 0) throw new Error("empty");
            return items;
          } catch (e: any) {
            if (e?.isTimeout) timeoutCount++;
            throw e;
          }
        })
      );
      return first;
    } catch {
      // If all BUs timed out (no genuine "empty" responses), signal a timeout
      // We check by trying once more with a quick flag — simpler: just recount externally
      return null;
    }
  }

  // Fallback: verify customer via service search (more reliable than subscription search)
  async function verifyViaServices(document: string): Promise<{ found: boolean; name: string }> {
    try {
      const bus = await getBusinessUnits().catch(() => [] as any[]);
      if (!bus.length) return { found: false, name: "" };

      // Search all BUs in parallel, resolve on first service found
      const results = await Promise.allSettled(
        bus.map(async (bu: any) => {
          const r = await fetch(`${WIP_BASE_URL}/service/api/v1/Service/search`, {
            method: "POST",
            headers: wipHeaders,
            body: JSON.stringify({
              pageSize: 1, page: 1,
              companyId: COMPANY_ID, userId: USER_ID,
              businessUnitId: bu.id,
              subject: document,
            }),
            signal: AbortSignal.timeout(12000),
          });
          if (!r.ok) return [];
          const text = await r.text();
          if (!text) return [];
          const json = JSON.parse(text);
          const arr = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
          if (arr.length === 0) throw new Error("empty");
          return arr;
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value.length > 0) {
          const svc = result.value[0];
          // WipTool service fields per official docs:
          // userName, userPhone, userClientePhone, finalClientName, customerDocument
          const name =
            svc.finalClientName ||
            svc.userName ||
            svc.customerName ||
            svc.clientName ||
            svc.customer?.name ||
            svc.customer?.fullName ||
            svc.holderName ||
            svc.name ||
            svc.fullName ||
            "";
          const phone =
            svc.userPhone ||
            svc.userClientePhone ||
            svc.customerPhone ||
            svc.phone ||
            svc.celular ||
            svc.customer?.phone ||
            "";
          console.log(`[wiptool] Verificado por servicio: nombre="${name}" tel="${phone}" para ${document}`);
          return { found: true, name, phone };
        }
      }
      return { found: false, name: "", phone: "" };
    } catch {
      return { found: false, name: "", phone: "" };
    }
  }

  // Extract phone from a WipTool subscription object
  function extractPhone(sub: any): string {
    let phone = sub.phone || sub.phoneNumber || sub.mobilePhone || sub.celular || sub.mobile || sub.customerPhone || "";
    if (!phone && Array.isArray(sub.fields)) {
      const f = sub.fields.find((f: any) => /cel|phone|movil|mobile|whatsapp/i.test(f.name || f.key || ""));
      if (f) phone = f.value || f.answer || "";
    }
    if (!phone && Array.isArray(sub.customFields)) {
      const f = sub.customFields.find((f: any) => /cel|phone|movil|mobile|whatsapp/i.test(f.name || f.key || ""));
      if (f) phone = f.value || f.answer || "";
    }
    if (phone) {
      phone = String(phone).replace(/\D/g, "");
      if (phone.length === 10) phone = "57" + phone;
    }
    return phone;
  }

  // Robust lookup: subscription search + service search in parallel for speed
  async function lookupWipCustomerRobust(document: string): Promise<
    { found: true; name: string; phone: string; subs: any[] } |
    { found: false; timedOut: boolean }
  > {
    const bus = await getBusinessUnits().catch(() => [] as any[]);
    if (!bus.length) return { found: false, timedOut: false };

    // Run subscription search and service search in parallel from the start
    const subSearchPromise = Promise.any(
      bus.map(async (bu: any) => {
        const items = await fetchOneBu(bu.id, document);
        if (items.length === 0) throw new Error("empty");
        return items;
      })
    ).catch((aggErr: any) => {
      const reasons: any[] = aggErr?.errors || [];
      const anyTimedOut = reasons.some((e: any) => e?.isTimeout === true);
      return { notFound: true, timedOut: anyTimedOut } as any;
    });

    const svcSearchPromise = verifyViaServices(document).catch(() => ({ found: false, name: "", phone: "" }));

    const [subResult, svcResult] = await Promise.all([subSearchPromise, svcSearchPromise]);

    // Check subscription result
    if (subResult && !subResult.notFound) {
      const firstItems = subResult as any[];
      const sub = firstItems[0];
      const name = sub.customerName || sub.name || sub.fullName || "";
      let phone = extractPhone(sub);

      // Prefer service phone if subscription phone is missing
      if (!phone && svcResult.found && svcResult.phone) {
        phone = svcResult.phone;
        console.log(`[wiptool] Cliente: ${name} | tel (servicios): ${phone}`);
      } else {
        console.log(`[wiptool] Cliente: ${name} | tel: ${phone || "N/A"} | keys: ${Object.keys(sub).join(",")}`);
      }

      return { found: true, name, phone, subs: firstItems };
    }

    // Subscription not found — check service result
    if (svcResult.found) {
      console.log(`[wiptool] Encontrado por servicios: nombre="${svcResult.name}" tel="${svcResult.phone}"`);
      return { found: true, name: svcResult.name, phone: svcResult.phone || "", subs: [] };
    }

    // Nothing found
    const timedOut = (subResult as any)?.timedOut === true;
    console.log(`[wiptool] No encontrado para ${document}. Timeout: ${timedOut}`);
    return { found: false, timedOut };
  }

  // Full fetch: all BUs in parallel (needed for email sync to all subscriptions)
  async function fetchWipSubscriptions(document: string): Promise<any[]> {
    try {
      const bus = await getBusinessUnits();
      if (!bus.length) return [];
      const results = await Promise.allSettled(bus.map((bu) => fetchOneBu(bu.id, document)));
      const seen = new Set<string>();
      const allSubs: any[] = [];
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        for (const sub of result.value) {
          if (sub?.id && !seen.has(sub.id)) { seen.add(sub.id); allSubs.push(sub); }
        }
      }
      return allSubs;
    } catch { return []; }
  }

  // Helper: lookup customer — fast path for check-document
  async function lookupWipCustomer(document: string): Promise<{ found: boolean; name?: string; subscriptions: any[] }> {
    const first = await findWipCustomerFast(document);
    if (!first) return { found: false, subscriptions: [] };
    const sub = first[0];
    const name = sub.name || sub.fullName || sub.customerName || sub.legalName || "";
    return { found: true, name, subscriptions: first };
  }

  // Normalize a Colombian phone to full E.164 format (57XXXXXXXXXX)
  function normalizeColombianPhone(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (digits.startsWith("57") && digits.length === 12) return digits;   // already has country code
    if (digits.startsWith("57") && digits.length > 12) return digits.slice(0, 12); // trim
    if (digits.startsWith("3") && digits.length === 10) return `57${digits}`; // Colombian mobile
    if (digits.startsWith("0") && digits.length === 11) return `57${digits.slice(1)}`; // 0 prefix
    return digits; // unknown format — send as-is
  }

  // Send OTP via WhatsApp using whapi.cloud
  async function sendWhatsAppOtp(phone: string, code: string, name: string): Promise<boolean> {
    try {
      const to = normalizeColombianPhone(phone);
      console.log(`[whapi] Enviando a número normalizado: ${to} (original: ${phone.replace(/\D/g, "")})`);
      const body = `Hola ${name.split(" ")[0]}, tu código de acceso a *CL Tiene* es:\n\n*${code}*\n\nVálido por 24 horas. No lo compartas con nadie.`;
      const res = await fetch(`${WHAPI_URL}messages/text`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WHAPI_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to, body }),
        signal: AbortSignal.timeout(10000),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`[whapi] WhatsApp enviado a ${to}:`, json.sent || json.message?.id || "ok");
        return true;
      } else {
        console.warn(`[whapi] Error enviando a ${to}:`, JSON.stringify(json));
        return false;
      }
    } catch (e) {
      console.warn("[whapi] Error en sendWhatsAppOtp:", e);
      return false;
    }
  }

  // Helper: update all WipTool subscriptions for a customer with a new email
  async function syncEmailToWipTool(subscriptions: any[], email: string): Promise<void> {
    for (const sub of subscriptions) {
      if (!sub?.id) continue;
      try {
        // WipTool PUT requires the full object including id, createdAt, updatedAt
        const body = {
          id: sub.id,
          createdAt: sub.createdAt,
          updatedAt: sub.updatedAt,
          name: sub.name,
          documentId: sub.documentId,
          additionalData: sub.additionalData || {},
          email,
          phone: sub.phone ?? null,
          plate: sub.plate ?? null,
          address1: sub.address1 ?? null,
          location1: sub.location1 ?? null,
          address2: sub.address2 ?? null,
          location2: sub.location2 ?? null,
          originFile: sub.originFile ?? null,
          businessUnitIds: sub.businessUnitIds || [],
          companyId: sub.companyId || COMPANY_ID,
        };
        const r = await fetch(`${WIP_BASE_URL}/Customer/api/v1/Customer/${sub.id}`, {
          method: "PUT",
          headers: wipHeaders,
          body: JSON.stringify(body),
        });
        if (r.ok) {
          console.log(`[wiptool] Email actualizado en suscripción ${sub.id}`);
        } else {
          const err = await r.text();
          console.warn(`[wiptool] Error actualizando ${sub.id}: ${err}`);
        }
      } catch (e) {
        console.warn(`[wiptool] Error en sync email para ${sub.id}:`, e);
      }
    }
  }

  // Step 1: Verify document in WipTool and check registration status
  app.post("/api/auth/check-document", async (req, res) => {
    try {
      const { document } = req.body;
      if (!document || typeof document !== "string" || document.trim().length < 6) {
        return res.status(400).json({ message: "Cédula requerida (mínimo 6 dígitos)" });
      }
      const doc = document.trim();

      // ── FAST PATH: user already registered in our DB ──────────────────────
      const existing = await storage.getUserByDocument(doc);
      if (existing && existing.active) {
        const rateKey = existing.email || doc;
        if (!checkOtpRate(rateKey)) {
          return res.status(429).json({ message: "Demasiadas solicitudes. Espera un momento." });
        }

        // Look up phone from WipTool (with 8s overall timeout)
        const maskedEmailStr = existing.email
          ? existing.email.replace(/(.{2}).*(@.*)/, "$1***$2")
          : "";
        const wip = await Promise.race([
          lookupWipCustomerRobust(doc).catch(() => null),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 8000)),
        ]);
        const wipPhone = (wip as any)?.found ? ((wip as any).phone || "") : "";

        // Restore session-cached phone if WipTool didn't return one
        const sessionPhone = (req.session.wipValidatedDoc === doc ? req.session.wipValidatedPhone : "") || "";
        const resolvedPhone = wipPhone || sessionPhone;

        req.session.wipValidatedDoc   = doc;
        req.session.wipValidatedName  = existing.name || "";
        req.session.wipValidatedPhone = resolvedPhone;

        const maskedPhone = resolvedPhone
          ? `***${resolvedPhone.replace(/\D/g, "").slice(-4)}`
          : "";

        return res.json({
          status: "choose_channel",
          name: existing.name,
          maskedEmail: maskedEmailStr,
          hasPhone: !!resolvedPhone,
          maskedPhone,
          hasEmail: !!existing.email,
        });
      }

      // ── NEW USER: verify in WipTool before allowing registration ─────────
      const wip = await lookupWipCustomerRobust(doc);
      if (!wip.found) {
        if (wip.timedOut) {
          return res.status(503).json({ message: "El sistema está tardando en responder. Por favor intenta de nuevo en unos segundos." });
        }
        return res.status(404).json({ message: "Cédula no encontrada en el sistema. Verifica el número e intenta de nuevo." });
      }

      // First time — needs to register email
      req.session.wipValidatedDoc   = doc;
      req.session.wipValidatedName  = wip.name || "";
      req.session.wipValidatedPhone = wip.phone || "";
      const maskedPhone = wip.phone
        ? `***${wip.phone.replace(/\D/g, "").slice(-4)}`
        : "";
      return res.json({
        status: "needs_email",
        name: wip.name || "",
        hasPhone: !!wip.phone,
        maskedPhone,
      });
    } catch (error) {
      console.error("[auth] check-document error:", error);
      res.status(500).json({ message: "Error interno" });
    }
  });

  // Step 1b: Send OTP to existing user via chosen channel
  app.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { document, channel } = req.body;
      if (!document || !channel) {
        return res.status(400).json({ message: "Cédula y canal requeridos" });
      }
      const doc = document.trim();
      const ch: "whatsapp" | "email" = channel === "whatsapp" ? "whatsapp" : "email";

      const user = await storage.getUserByDocument(doc);
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      const rateKey = user.email || doc;
      if (!checkOtpRate(rateKey)) {
        return res.status(429).json({ message: "Demasiadas solicitudes. Espera un momento." });
      }

      await storage.invalidateUserOtps(user.id);
      const code = generateOtp();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.createOtp(user.id, code, expiresAt);

      // Phone ONLY from session (set by WipTool lookup in check-document) — never from request body
      const wipPhone = (req.session.wipValidatedDoc === doc ? req.session.wipValidatedPhone : "") || "";
      let sentChannel: "whatsapp" | "email" = "email";
      const maskedEmailFallback = user.email ? user.email.replace(/(.{2}).*(@.*)/, "$1***$2") : "—";
      let maskedDest = maskedEmailFallback;

      if (ch === "whatsapp" && wipPhone) {
        const sent = await sendWhatsAppOtp(wipPhone, code, user.name || "");
        if (sent) {
          sentChannel = "whatsapp";
          maskedDest = `***${wipPhone.replace(/\D/g, "").slice(-4)}`;
          console.log(`[auth] OTP enviado por WhatsApp a ${wipPhone}`);
        } else {
          console.warn("[auth] WhatsApp falló, usando email como fallback");
        }
      }

      if (sentChannel === "email" && user.email) {
        if (smtpTransporter) {
          try {
            await smtpTransporter.sendMail({
              from: `CL Tiene <${smtpUser}>`,
              to: user.email,
              subject: "Tu código de acceso — CL Tiene",
              html: `<div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; text-align: center;">
                <h2 style="color: #FF8147;">CL Tiene</h2>
                <p>Hola <strong>${user.name}</strong>, tu código de acceso es:</p>
                <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px; background: #f5f5f5; border-radius: 12px; margin: 16px 0;">${code}</div>
                <p style="color: #888; font-size: 13px;">Este código expira en 24 horas.</p>
              </div>`,
            });
          } catch (e) {
            console.error("[auth] Error SMTP en send-otp:", e);
          }
        }
      } else if (sentChannel === "email" && !user.email) {
        // No email and WhatsApp also failed — error
        return res.status(400).json({ message: "No se encontró correo ni teléfono para enviar el código." });
      }

      res.json({ status: "otp_sent", name: user.name, maskedEmail: maskedDest, channel: sentChannel });
    } catch (error) {
      console.error("[auth] send-otp error:", error);
      res.status(500).json({ message: "Error interno" });
    }
  });

  // Step 2 (first time): Register email and send OTP
  app.post("/api/auth/register-email", async (req, res) => {
    try {
      const { document, email, channel } = req.body;
      const preferredChannel: "whatsapp" | "email" = channel === "whatsapp" ? "whatsapp" : "email";
      if (!document || !email) {
        return res.status(400).json({ message: "Cédula y correo requeridos" });
      }
      const doc = document.trim();
      const normalizedEmail = email.toLowerCase().trim();

      // Use session-cached validation from step 1 if available — avoids redundant WipTool call
      let wipName: string;
      if (req.session.wipValidatedDoc === doc && req.session.wipValidatedName) {
        wipName = req.session.wipValidatedName;
        console.log(`[auth] register-email: usando validación en sesión para ${doc}`);
      } else {
        const wip = await lookupWipCustomerRobust(doc);
        if (!wip.found) {
          if (wip.timedOut) {
            return res.status(503).json({ message: "El sistema está tardando en responder. Por favor intenta de nuevo en unos segundos." });
          }
          return res.status(404).json({ message: "Cédula no encontrada en el sistema." });
        }
        wipName = wip.name || "";
      }

      // Rate limit
      if (!checkOtpRate(normalizedEmail)) {
        return res.status(429).json({ message: "Demasiadas solicitudes. Espera un momento." });
      }

      // Look up by document first (handles email change case)
      let user = await storage.getUserByDocument(doc);
      if (user) {
        // Existing user — update email (they may be changing it)
        const [updated] = await db
          .update(users)
          .set({ email: normalizedEmail, name: wipName || user.name })
          .where(eq(users.id, user.id))
          .returning();
        user = updated;
      } else {
        // Check email not already taken by another document
        const byEmail = await storage.getUserByEmail(normalizedEmail);
        if (byEmail && byEmail.document && byEmail.document !== doc) {
          return res.status(409).json({ message: "Este correo ya está registrado con otra cédula." });
        }
        if (byEmail) {
          // Link document to existing email-only user
          const [updated] = await db
            .update(users)
            .set({ document: doc, name: wipName || byEmail.name })
            .where(eq(users.id, byEmail.id))
            .returning();
          user = updated;
        } else {
          // Brand new user
          user = await storage.createUser({
            document: doc,
            email: normalizedEmail,
            name: wipName || "Usuario",
            active: true,
          });
        }
      }

      // Sync email to ALL WipTool subscriptions in background (non-blocking)
      fetchWipSubscriptions(doc).then((allSubs) =>
        syncEmailToWipTool(allSubs, normalizedEmail)
      ).catch((e) =>
        console.warn("[wiptool] sync email failed (non-fatal):", e)
      );

      await storage.invalidateUserOtps(user.id);
      const code = generateOtp();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.createOtp(user.id, code, expiresAt);

      // Phone ONLY from session (set by WipTool lookup in check-document) — never from request body
      const wipPhone = (req.session.wipValidatedDoc === doc ? req.session.wipValidatedPhone : "") || "";
      let sentChannel: "whatsapp" | "email" = "email";
      let maskedDest = normalizedEmail.replace(/(.{2}).*(@.*)/, "$1***$2");

      // Send via chosen channel
      if (preferredChannel === "whatsapp" && wipPhone) {
        console.log(`[auth] OTP registro via WhatsApp para ${wipPhone}`);
        const sent = await sendWhatsAppOtp(wipPhone, code, user.name || "");
        if (sent) {
          sentChannel = "whatsapp";
          maskedDest = `***${wipPhone.replace(/\D/g, "").slice(-4)}`;
        } else {
          console.warn("[auth] WhatsApp falló, usando email como fallback");
        }
      }

      // Email: send if preferred, or as fallback
      if (sentChannel === "email") {
        if (smtpTransporter) {
          try {
            const info = await smtpTransporter.sendMail({
              from: `CL Tiene <${smtpUser}>`,
              to: normalizedEmail,
              subject: "Tu código de acceso — CL Tiene",
              html: `<div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; text-align: center;">
                <h2 style="color: #FF8147;">CL Tiene</h2>
                <p>Hola <strong>${user.name}</strong>, tu código de acceso es:</p>
                <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px; background: #f5f5f5; border-radius: 12px; margin: 16px 0;">${code}</div>
                <p style="color: #888; font-size: 13px;">Este código expira en 24 horas.</p>
              </div>`,
            });
            console.log("[auth] Email enviado:", info.messageId);
          } catch (emailErr: unknown) {
            console.error("[auth] Error SMTP:", emailErr instanceof Error ? emailErr.message : emailErr);
          }
        }
      }

      console.log(`[auth] OTP registro para ${normalizedEmail} | canal: ${sentChannel}`);
      res.json({ status: "otp_sent", name: user.name, maskedEmail: maskedDest, channel: sentChannel });
    } catch (error) {
      console.error("[auth] register-email error:", error);
      res.status(500).json({ message: "Error interno" });
    }
  });

  // Step 2 alternative: register via WhatsApp only (no email required)
  app.post("/api/auth/register-whatsapp", async (req, res) => {
    try {
      const { document } = req.body;
      if (!document) {
        return res.status(400).json({ message: "Cédula requerida" });
      }
      const doc = document.trim();
      // Phone ONLY from session (set by WipTool lookup in check-document) — never from request body
      const sessionPhone = (req.session.wipValidatedDoc === doc ? req.session.wipValidatedPhone : "") || "";
      const rawPhone = sessionPhone.replace(/\D/g, "");
      if (rawPhone.length < 7) {
        return res.status(400).json({ message: "No hay número de WhatsApp registrado en el sistema para esta cédula." });
      }

      // Verify session validation from step 1
      let wipName: string;
      if (req.session.wipValidatedDoc === doc && req.session.wipValidatedName) {
        wipName = req.session.wipValidatedName;
      } else {
        const wip = await lookupWipCustomerRobust(doc);
        if (!wip.found) {
          if (wip.timedOut) return res.status(503).json({ message: "El sistema está tardando. Intenta de nuevo." });
          return res.status(404).json({ message: "Cédula no encontrada en el sistema." });
        }
        wipName = wip.name || "";
      }

      if (!checkOtpRate(doc)) {
        return res.status(429).json({ message: "Demasiadas solicitudes. Espera un momento." });
      }

      // Create or find user (no email)
      let user = await storage.getUserByDocument(doc);
      if (!user) {
        user = await storage.createUser({
          document: doc,
          email: null as any,
          name: wipName || "Usuario",
          active: true,
        });
      }

      // Cache phone in session for future logins
      req.session.wipValidatedDoc   = doc;
      req.session.wipValidatedName  = user.name;
      req.session.wipValidatedPhone = rawPhone;

      await storage.invalidateUserOtps(user.id);
      const code = generateOtp();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.createOtp(user.id, code, expiresAt);

      const sent = await sendWhatsAppOtp(rawPhone, code, user.name);
      if (!sent) {
        return res.status(500).json({ message: "No se pudo enviar el código por WhatsApp. Intenta con correo." });
      }

      const maskedPhone = `***${normalizeColombianPhone(rawPhone).slice(-4)}`;
      console.log(`[auth] OTP WhatsApp-only para ${doc}: ${maskedPhone}`);
      res.json({ status: "otp_sent", name: user.name, maskedEmail: maskedPhone, channel: "whatsapp" });
    } catch (error) {
      console.error("[auth] register-whatsapp error:", error);
      res.status(500).json({ message: "Error interno" });
    }
  });

  // Verify OTP by document (replaces email-based verify for new flow)
  app.post("/api/auth/verify-otp-document", async (req, res) => {
    try {
      const { document, code } = req.body;
      if (!document || !code) {
        return res.status(400).json({ message: "Cédula y código requeridos" });
      }
      const doc = document.trim();

      if (!checkVerifyAttempts(doc)) {
        return res.status(429).json({ message: "Demasiados intentos. Espera 15 minutos." });
      }

      const user = await storage.getUserByDocument(doc);
      if (!user || !user.active) {
        return res.status(401).json({ message: "Código incorrecto o expirado" });
      }

      const valid = await storage.verifyOtp(user.id, code);
      if (!valid) {
        return res.status(401).json({ message: "Código incorrecto o expirado" });
      }

      resetVerifyAttempts(doc);

      req.session.userId = user.id;
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("[auth] session save error:", saveErr);
          return res.status(500).json({ message: "Error interno al guardar sesión" });
        }
        storage.logAction(`Login exitoso por cédula: ${user.email}`);
        res.json({ user: { id: user.id, email: user.email, name: user.name } });
      });
    } catch (error) {
      console.error("[auth] verify-otp-document error:", error);
      res.status(500).json({ message: "Error interno" });
    }
  });

  app.post("/api/auth/request-otp", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email requerido" });
      }

      const normalizedEmail = email.toLowerCase().trim();

      if (!checkOtpRate(normalizedEmail)) {
        return res.status(429).json({ message: "Demasiadas solicitudes. Espera un momento antes de intentar de nuevo." });
      }

      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user || !user.active) {
        return res.json({ message: "Si el correo está registrado, recibirás un código de acceso." });
      }

      await storage.invalidateUserOtps(user.id);

      const code = generateOtp();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.createOtp(user.id, code, expiresAt);

      console.log(`[auth] OTP generado para ${normalizedEmail} (expira en 24h)`);

      let emailSent = false;
      if (smtpTransporter) {
        try {
          const info = await smtpTransporter.sendMail({
            from: `CL Tiene <${smtpUser}>`,
            to: normalizedEmail,
            subject: "Tu código de acceso — CL Tiene",
            html: `
              <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; text-align: center;">
                <h2 style="color: #FF8147;">CL Tiene</h2>
                <p>Tu código de acceso es:</p>
                <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px; background: #f5f5f5; border-radius: 12px; margin: 16px 0;">
                  ${code}
                </div>
                <p style="color: #888; font-size: 13px;">Este código expira en 24 horas.</p>
              </div>
            `,
          });
          console.log("[auth] Email enviado:", info.messageId);
          emailSent = true;
        } catch (emailErr: unknown) {
          console.error("[auth] Error enviando email SMTP:", emailErr instanceof Error ? emailErr.message : emailErr);
        }
      }
      if (!emailSent) {
        console.log(`[auth] FALLBACK — OTP para ${normalizedEmail}: ${code}`);
      }

      res.json({ message: "Si el correo está registrado, recibirás un código de acceso." });
    } catch (error) {
      console.error("[auth] request-otp error:", error);
      res.status(500).json({ message: "Error interno" });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ message: "Email y código requeridos" });
      }

      const normalizedEmail = email.toLowerCase().trim();

      if (!checkVerifyAttempts(normalizedEmail)) {
        return res.status(429).json({ message: "Demasiados intentos. Espera 15 minutos antes de intentar de nuevo." });
      }

      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user || !user.active) {
        return res.status(401).json({ message: "Código incorrecto o expirado" });
      }

      const valid = await storage.verifyOtp(user.id, code);
      if (!valid) {
        return res.status(401).json({ message: "Código incorrecto o expirado" });
      }

      resetVerifyAttempts(normalizedEmail);

      req.session.regenerate((err) => {
        if (err) {
          console.error("[auth] session regenerate error:", err);
          return res.status(500).json({ message: "Error interno" });
        }
        req.session.userId = user.id;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[auth] session save error:", saveErr);
            return res.status(500).json({ message: "Error interno" });
          }
          storage.logAction(`Login exitoso: ${user.email}`);
          res.json({ user: { id: user.id, email: user.email, name: user.name } });
        });
      });
    } catch (error) {
      console.error("[auth] verify-otp error:", error);
      res.status(500).json({ message: "Error interno" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("[auth] logout error:", err);
        return res.status(500).json({ message: "Error al cerrar sesión" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Sesión cerrada" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "No autorizado" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user || !user.active) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "No autorizado" });
    }
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  });

  // ----------------------------------------------------------
  // PROTECTED API ROUTES (WipTool proxy)
  // ----------------------------------------------------------

  app.get(api.businessUnits.list.path, requireAuth, async (req, res) => {
    try {
      const response = await fetch(
        `${WIP_BASE_URL}/business/api/v1/BusinessUnit/company/${COMPANY_ID}/business-units/services`,
        { headers: wipHeaders }
      );
      if (!response.ok) {
        const err = await response.text();
        console.error("Error BUs:", err);
        return res.status(response.status).json({ message: "Error al obtener unidades de negocio", detail: err });
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("BU fetch error:", error);
      res.status(500).json({ message: "Error interno al obtener unidades de negocio" });
    }
  });

  app.post(api.services.search.path, requireAuth, async (req, res) => {
    try {
      const input = api.services.search.input.parse(req.body);

      if (!input.subject || input.subject.trim().length < 8) {
        return res.status(400).json({ message: "Se requiere una cédula completa (mínimo 8 caracteres)" });
      }

      const buildPayload = (buId: string) => {
        const payload: Record<string, any> = {
          pageSize: 50,
          page: 1,
          sort: "scheduledDate",
          sortDirection: "Desc",
          companyId: COMPANY_ID,
          userId: USER_ID,
          businessUnitId: buId,
          subject: input.subject ?? "",
        };
        if (input.status)    payload.status    = input.status;
        if (input.startDate) payload.startDate = input.startDate;
        if (input.endDate)   payload.endDate   = input.endDate;
        return payload;
      };

      const searchInBU = async (buId: string): Promise<any[]> => {
        console.log(`[search] BU=${buId} subject="${input.subject}"`);
        try {
          const response = await fetch(`${WIP_BASE_URL}/service/api/v1/Service/search`, {
            method: 'POST',
            headers: wipHeaders,
            body: JSON.stringify(buildPayload(buId)),
          });
          const text = await response.text();
          if (!text) return [];
          const json = JSON.parse(text);
          if (Array.isArray(json)) return json;
          if (json.data && Array.isArray(json.data)) return json.data;
          return [];
        } catch (e) {
          console.error(`[search] Error en BU ${buId}:`, e);
          return [];
        }
      };

      let allResults: any[] = [];

      if (input.businessUnitId && input.businessUnitId !== "all") {
        allResults = await searchInBU(input.businessUnitId);
      } else {
        const buResponse = await fetch(
          `${WIP_BASE_URL}/business/api/v1/BusinessUnit/company/${COMPANY_ID}/business-units/services`,
          { headers: wipHeaders }
        );
        const buData = await buResponse.json();
        const bus: { id: string }[] = buData.businessUnits || [];
        const results = await Promise.all(bus.map((bu) => searchInBU(bu.id)));
        allResults = results.flat();
        allResults.sort((a, b) =>
          new Date(b.scheduledDate ?? 0).getTime() - new Date(a.scheduledDate ?? 0).getTime()
        );
      }

      res.json({ data: allResults, total: allResults.length });
    } catch (error) {
      console.error("[search] Error:", error);
      res.status(500).json({ message: "Error al buscar servicios" });
    }
  });

  app.post(api.services.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.services.create.input.parse(req.body);

      // Auto-fill email from logged-in user if not provided in form
      const sessionUser = await storage.getUserById(req.session.userId!);
      const resolvedEmail = input.customerEmail || sessionUser?.email || null;

      const payload = {
        owner: {
          id: OWNER_ID,
          name: OWNER_NAME,
          type: "Owner",
        },
        buOwner: {
          id: BU_OWNER_ID,
          name: OWNER_NAME,
          type: "BuOwner",
        },
        creatorUser: {
          id: USER_ID,
          name: "name user creator",
        },
        expedient: input.expedient ?? "",
        userName: input.userName,
        userPhone: input.userPhone ?? "",
        userClientePhone: input.userClientePhone ?? "",
        finalClientName: input.finalClientName,
        customerDocument: input.customerDocument ?? "",
        businessUnitId: input.businessUnitId,
        businessUnitName: input.businessUnitName ?? "",
        plate: input.plate ?? "",
        scheduledDate: input.scheduledDate,
        type: input.type,
        note: input.note ?? "",
        formId: input.formId ?? "",
        companyFormId: input.companyFormId ?? "",
        customerId: input.customerId ?? null,
        automaticCalculation: true,
        whereTo: input.whereTo ?? null,
        fromWhere: input.fromWhere ?? null,
        fields: {
          "Quien reporta": input.userName,
          "Estado de pago": input.estadoPago || null,
          "Cuenta Base": input.cuentaBase || null,
          "Correo electrónico": resolvedEmail,
          "Titular - Correo electrónico": resolvedEmail,
          "Titular - Tipo de documento": input.customerDocType || null,
          "Titular - Fecha de nacimiento": input.customerBirthdate || null,
          "Titular - Sexo": input.customerSex || null,
          "Titular - Estado civil": input.customerCivilStatus || null,
          "Titular - Código postal": input.customerZipCode || null,
          "Titular - Dirección": input.customerAddress || null,
          "Mascota - Tipo": input.petType || null,
          "Mascota - Nombre": input.petName || null,
          "Mascota - Raza": input.petBreed || null,
          "Mascota - Sexo": input.petSex || null,
          "Mascota - Edad": input.petAge || null,
          "Mascota - Color": input.petColor || null,
          "Mascota - Tamaño": input.petSize || null,
          "Vehículo - Tipo": input.vehicleType || null,
          "Vehículo - Marca": input.vehicleBrand || null,
          "Vehículo - Color": input.vehicleColor || null,
          "Beneficiarios": (input.beneficiaries && input.beneficiaries.length > 0)
            ? JSON.stringify(input.beneficiaries)
            : null,
        },
      };

      console.log(`[create] Creando servicio para ${input.userName} — BU: ${input.businessUnitId}`);

      const response = await fetch(
        `${WIP_BASE_URL}/service/api/v2/Service/${COMPANY_ID}/service/${USER_ID}`,
        {
          method: 'POST',
          headers: wipHeaders,
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error("[create] WipTool error:", errText);
        return res.status(400).json({ message: "Error de WipTool al crear servicio", detail: errText });
      }

      const data = await response.json();
      await storage.logAction(`Servicio creado para ${input.userName} — expediente: ${data.wipExpedient}`);

      res.status(201).json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join('.'),
        });
      }
      console.error("[create] Error:", error);
      res.status(500).json({ message: "Error interno al crear servicio" });
    }
  });

  app.get('/api/services/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const response = await fetch(`${WIP_BASE_URL}/service/api/v1/Service/${id}`, {
        headers: wipHeaders,
      });
      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ message: "Servicio no encontrado", detail: err });
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("[getById] Error:", error);
      res.status(500).json({ message: "Error al obtener el servicio" });
    }
  });

  app.get('/api/subscriptions', requireAuth, async (req, res) => {
    try {
      const { businessUnitId, searchTerm } = req.query as { businessUnitId?: string; searchTerm?: string };
      if (!searchTerm || searchTerm.trim().length < 8) {
        return res.status(400).json({ message: "Se requiere una cédula completa (mínimo 8 caracteres)" });
      }

      const searchInBU = async (buId: string) => {
        const url = `${WIP_BASE_URL}/Customer/api/v1/Customer/Subscription?companyId=${COMPANY_ID}&businessUnitId=${buId}&searchTerm=${encodeURIComponent(searchTerm as string)}`;
        try {
          const r = await fetch(url, { headers: wipHeaders });
          if (!r.ok) return null;
          return await r.json();
        } catch { return null; }
      };

      if (businessUnitId && businessUnitId !== "all") {
        const result = await searchInBU(businessUnitId);
        return res.json(result);
      }

      const buResponse = await fetch(
        `${WIP_BASE_URL}/business/api/v1/BusinessUnit/company/${COMPANY_ID}/business-units/services`,
        { headers: wipHeaders }
      );
      const buData = await buResponse.json();
      const bus: { id: string }[] = buData.businessUnits || [];
      const results = await Promise.all(bus.map((bu) => searchInBU(bu.id)));
      const found = results.filter(Boolean);
      res.json(found.length === 1 ? found[0] : found);
    } catch (error) {
      console.error("[subscriptions] Error:", error);
      res.status(500).json({ message: "Error al buscar suscripciones" });
    }
  });

  app.post('/api/subscriptions/consumption', requireAuth, async (req, res) => {
    try {
      const { customerId, businessUnitId } = req.body;
      if (!customerId || !businessUnitId) {
        return res.status(400).json({ message: "customerId y businessUnitId son requeridos" });
      }

      const response = await fetch(
        `${WIP_BASE_URL}/Customer/api/v1/Customer/Subscription/Consumption`,
        {
          method: 'POST',
          headers: wipHeaders,
          body: JSON.stringify({ customerId, businessUnitId }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error("[consumption] WipTool error:", errText);
        return res.status(response.status).json({ message: "Error al consultar consumo", detail: errText });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("[consumption] Error:", error);
      res.status(500).json({ message: "Error al consultar consumo de servicios" });
    }
  });

  return httpServer;
}
