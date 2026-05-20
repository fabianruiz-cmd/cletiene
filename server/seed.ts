import { storage } from "./storage";

async function seed() {
  const adminEmail = "admin@cltiene.com";
  const existing = await storage.getUserByEmail(adminEmail);
  if (!existing) {
    const user = await storage.createUser({
      email: adminEmail,
      name: "Administrador",
      active: true,
    });
    console.log(`[seed] Admin user created: ${user.email} (id: ${user.id})`);
  } else {
    console.log(`[seed] Admin user already exists: ${existing.email} (id: ${existing.id})`);
  }
}

seed().then(() => process.exit(0)).catch((e) => {
  console.error("[seed] Error:", e);
  process.exit(1);
});
