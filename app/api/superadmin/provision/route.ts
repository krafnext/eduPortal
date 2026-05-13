import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin-guard";
import { db } from "@/lib/db";
import { parseDatabaseUrl, buildTenantUrl } from "@/lib/parse-db-url";
import { z } from "zod";
import { execSync } from "child_process";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import path from "path";

export const dynamic = "force-dynamic";

export const maxDuration = 60;

const schema = z.object({
  school: z.object({
    name: z.string().min(2),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
    domain: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    principalName: z.string().optional(),
    planId: z.string().optional(),
    verifyToken: z.string().optional(),
    isVerified: z.boolean().default(false),
  }),
  admin: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

export async function POST(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { school: schoolData, admin } = schema.parse(await req.json());
  const dbName = `school_${schoolData.slug}`;

  // Check slug uniqueness
  const existing = await db.school.findUnique({ where: { slug: schoolData.slug } });
  if (existing) return NextResponse.json({ error: "Slug already in use" }, { status: 400 });

  // Check admin email uniqueness in main DB
  const existingAdmin = await db.user.findUnique({ where: { email: admin.email } });
  if (existingAdmin) return NextResponse.json({ error: "Admin email already exists" }, { status: 400 });

  const base = parseDatabaseUrl(process.env.DATABASE_URL!);
  let schoolId: string | null = null;

  try {
    // Step 1 — Create School record (TRIAL status initially)
    const school = await db.school.create({
      data: {
        name: schoolData.name,
        slug: schoolData.slug,
        domain: schoolData.domain || null,
        address: schoolData.address || null,
        phone: schoolData.phone || null,
        email: schoolData.email || null,
        principalName: schoolData.principalName || null,
        planId: schoolData.planId || null,
        verifyToken: schoolData.verifyToken || null,
        isVerified: schoolData.isVerified,
        status: "TRIAL",
        dbName,
      },
    });
    schoolId = school.id;

    // Step 2 — Create tenant MySQL database
    const rootConn = await mysql.createConnection({
      host: base.host,
      port: base.port,
      user: base.user,
      password: base.password,
    });
    await rootConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await rootConn.end();

    // Step 3 — Push tenant schema
    const tenantUrl = buildTenantUrl(base, dbName);
    const schemaPath = path.join(process.cwd(), "prisma", "schema-tenant.prisma");
    execSync(`npx prisma db push --schema="${schemaPath}" --skip-generate --accept-data-loss`, {
      env: { ...process.env, DATABASE_URL: tenantUrl },
      cwd: process.cwd(),
      timeout: 45000,
    });

    // Step 4 — Seed tenant DB with defaults
    const tenantConn = await mysql.createConnection({
      host: base.host,
      port: base.port,
      user: base.user,
      password: base.password,
      database: dbName,
    });

    const yearId = randomUUID();
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    await tenantConn.query(
      `INSERT INTO AcademicYear (id, name, startDate, endDate, isCurrent, createdAt, updatedAt)
       VALUES (?, '2025-2026', '2025-04-01', '2026-03-31', 1, ?, ?)`,
      [yearId, now, now]
    );

    const feeCategories = [
      ["Tuition Fee", "Monthly/term tuition charges", 1],
      ["Exam Fee", "Examination and assessment fees", 1],
      ["Library Fee", "Library membership and late return", 0],
      ["Transport Fee", "School bus and transport charges", 1],
      ["Activity Fee", "Sports, arts, and co-curricular activities", 0],
    ];
    for (const [name, description, isRecurring] of feeCategories) {
      await tenantConn.query(
        `INSERT INTO FeeCategory (id, name, description, isRecurring, createdAt) VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), name, description, isRecurring, now]
      );
    }

    // Step 5 — Create school admin in tenant DB
    const hashedPassword = await bcrypt.hash(admin.password, 10);
    const adminUserId = randomUUID();
    await tenantConn.query(
      `INSERT INTO User (id, name, email, password, role, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'SCHOOL_ADMIN', 1, ?, ?)`,
      [adminUserId, admin.name, admin.email, hashedPassword, now, now]
    );
    await tenantConn.end();

    // Step 6 — Create school admin in main DB
    const mainAdmin = await db.user.create({
      data: {
        name: admin.name,
        email: admin.email,
        password: hashedPassword,
        role: "SCHOOL_ADMIN",
        isActive: true,
        schoolId: school.id,
      },
    });

    // Step 7 — Activate school
    await db.school.update({
      where: { id: school.id },
      data: { status: "ACTIVE", subscriptionStatus: "TRIAL" },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        actorId: mainAdmin.id,
        actorType: "superadmin",
        action: "SCHOOL_PROVISIONED",
        entityType: "School",
        entityId: school.id,
        meta: { schoolName: school.name, dbName, adminEmail: admin.email },
      },
    });

    return NextResponse.json({ success: true, schoolId: school.id, dbName });
  } catch (err) {
    console.error("Provisioning failed:", err);

    // Rollback: delete school record if it was created
    if (schoolId) {
      await db.school.delete({ where: { id: schoolId } }).catch(() => null);
    }

    // Rollback: drop tenant DB if it was created
    try {
      const rollbackConn = await mysql.createConnection({
        host: base.host, port: base.port, user: base.user, password: base.password,
      });
      await rollbackConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
      await rollbackConn.end();
    } catch (_) {}

    return NextResponse.json(
      { error: "Provisioning failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
