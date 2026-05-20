import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";

export const localLogs = pgTable("local_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  document: text("document").unique(),
  email: text("email").unique(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const otpCodes = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const insertOtpSchema = createInsertSchema(otpCodes).omit({ id: true, createdAt: true });
export type InsertOtp = z.infer<typeof insertOtpSchema>;
export type OtpCode = typeof otpCodes.$inferSelect;

export const searchServiceSchema = z.object({
  subject: z.string().optional().default(""),
  page: z.number().default(1),
  pageSize: z.number().default(50),
  businessUnitId: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const beneficiarySchema = z.object({
  name: z.string().optional(),
  docType: z.string().optional(),
  docNumber: z.string().optional(),
  birthdate: z.string().optional(),
  sex: z.string().optional(),
  relationship: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  email: z.string().optional(),
});

export const createServiceSchema = z.object({
  expedient: z.string().optional(),
  userName: z.string().min(1, "Nombre del agente requerido"),
  userPhone: z.string().optional(),
  businessUnitId: z.string().min(1, "Unidad de negocio requerida"),
  businessUnitName: z.string().optional(),
  plate: z.string().optional(),
  finalClientName: z.string().min(1, "Nombre del cliente final requerido"),
  customerDocument: z.string().optional(),
  customerDocType: z.string().optional(),
  customerEmail: z.string().email("Correo electrónico inválido").optional().or(z.literal("")),
  userClientePhone: z.string().optional(),
  customerBirthdate: z.string().optional(),
  customerSex: z.string().optional(),
  customerCivilStatus: z.string().optional(),
  customerZipCode: z.string().optional(),
  customerAddress: z.string().optional(),
  scheduledDate: z.string().min(1, "Fecha programada requerida"),
  type: z.string().min(1, "Tipo de servicio requerido"),
  formId: z.string().optional(),
  companyFormId: z.string().optional(),
  customerId: z.string().nullable().optional(),
  note: z.string().optional(),
  estadoPago: z.string().optional(),
  cuentaBase: z.string().optional(),
  whereTo: z.object({
    address: z.string().optional(),
    otherInfo: z.string().optional(),
    city: z.string().optional(),
  }).optional(),
  fromWhere: z.object({
    address: z.string().optional(),
    otherInfo: z.string().optional(),
    city: z.string().optional(),
  }).optional(),
  petType: z.string().optional(),
  petName: z.string().optional(),
  petBreed: z.string().optional(),
  petSex: z.string().optional(),
  petAge: z.string().optional(),
  petColor: z.string().optional(),
  petSize: z.string().optional(),
  vehicleType: z.string().optional(),
  vehicleBrand: z.string().optional(),
  vehicleColor: z.string().optional(),
  beneficiaries: z.array(beneficiarySchema).optional(),
});

export type SearchServiceInput = z.infer<typeof searchServiceSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
