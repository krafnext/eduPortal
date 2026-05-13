import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const dynamic = "force-dynamic";

const rowSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  className: z.string().min(1),
  section: z.string().default("A"),
  rollNumber: z.string().optional(),
  phone: z.string().optional(),
  fatherName: z.string().optional(),
  fatherPhone: z.string().optional(),
  motherName: z.string().optional(),
  motherPhone: z.string().optional(),
  bloodGroup: z.string().optional(),
  previousSchool: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { rows } = await req.json();
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "rows must be an array" }, { status: 400 });
  }

  // Cache classes for this school
  const classes = await db.class.findMany({ select: { id: true, name: true, section: true } });
  const classMap = new Map(classes.map((c) => [`${c.name}::${c.section}`, c.id]));

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];
  const defaultHash = await bcrypt.hash("password123", 10);

  for (let i = 0; i < rows.length; i++) {
    const parsed = rowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      errors.push({ row: i + 1, reason: parsed.error.errors[0].message });
      skipped++;
      continue;
    }

    const {
      name, email, gender, dateOfBirth, className, section, rollNumber,
      phone, fatherName, fatherPhone, motherName, motherPhone, bloodGroup, previousSchool,
    } = parsed.data;

    const classId = classMap.get(`${className}::${section}`);
    if (!classId) {
      errors.push({ row: i + 1, reason: `Class "${className} ${section}" not found` });
      skipped++;
      continue;
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      errors.push({ row: i + 1, reason: "Email already in use" });
      skipped++;
      continue;
    }

    try {
      const count = await db.student.count();
      const studentId = `STU${String(count + 1).padStart(4, "0")}`;

      const user = await db.user.create({
        data: {
          name,
          email,
          password: defaultHash,
          role: "STUDENT",
          phone,
          schoolId: session.user.schoolId ?? undefined,
          student: {
            create: {
              studentId,
              classId,
              rollNumber,
              gender,
              bloodGroup: bloodGroup || undefined,
              dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
              previousSchool,
            },
          },
        },
        include: { student: true },
      });

      const student = user.student!;

      if (fatherName) {
        const guardian = await db.guardian.create({
          data: { name: fatherName, relation: "FATHER", phone: fatherPhone || "N/A", schoolId: session.user.schoolId! },
        });
        await db.studentGuardian.create({ data: { studentId: student.id, guardianId: guardian.id, isPrimary: true } });
      }

      if (motherName) {
        const guardian = await db.guardian.create({
          data: { name: motherName, relation: "MOTHER", phone: motherPhone || "N/A", schoolId: session.user.schoolId! },
        });
        await db.studentGuardian.create({
          data: { studentId: student.id, guardianId: guardian.id, isPrimary: !fatherName },
        });
      }

      await db.enrollment.create({
        data: { studentId: student.id, classId, academicYear: "2025-2026", rollNumber, status: "ACTIVE" },
      });

      imported++;
    } catch {
      errors.push({ row: i + 1, reason: "Database error" });
      skipped++;
    }
  }

  return NextResponse.json({ imported, skipped, errors });
}
