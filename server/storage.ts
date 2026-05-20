import { db } from "./db";
import { localLogs, users, otpCodes, type User, type InsertUser } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";

export interface IStorage {
  logAction(action: string): Promise<void>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByDocument(document: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
  updateUserEmail(userId: number, email: string): Promise<User>;
  createOtp(userId: number, code: string, expiresAt: Date): Promise<void>;
  verifyOtp(userId: number, code: string): Promise<boolean>;
  invalidateUserOtps(userId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async logAction(action: string): Promise<void> {
    await db.insert(localLogs).values({ action });
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
    return user;
  }

  async getUserByDocument(document: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.document, document.trim()));
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values({
      ...data,
      email: data.email ? data.email.toLowerCase().trim() : null,
    }).returning();
    return user;
  }

  async updateUserEmail(userId: number, email: string): Promise<User> {
    const [user] = await db.update(users)
      .set({ email: email.toLowerCase().trim() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async createOtp(userId: number, code: string, expiresAt: Date): Promise<void> {
    await db.insert(otpCodes).values({ userId, code, expiresAt, used: false });
  }

  async verifyOtp(userId: number, code: string): Promise<boolean> {
    const now = new Date();
    const [otp] = await db.select().from(otpCodes).where(
      and(
        eq(otpCodes.userId, userId),
        eq(otpCodes.code, code),
        eq(otpCodes.used, false),
        gt(otpCodes.expiresAt, now),
      )
    );
    if (!otp) return false;
    await db.update(otpCodes).set({ used: true }).where(eq(otpCodes.id, otp.id));
    return true;
  }

  async invalidateUserOtps(userId: number): Promise<void> {
    await db.update(otpCodes).set({ used: true }).where(
      and(eq(otpCodes.userId, userId), eq(otpCodes.used, false))
    );
  }
}

export const storage = new DatabaseStorage();
