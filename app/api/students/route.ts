import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { findOrCreateParentAccount } from "@/lib/parent-account";

export const dynamic = "force-dynamic";

function isSchoolStaff(role: string) {
  return ["SCHOOL_ADMIN", "ADMIN", "STAFF"].includes(role);
}

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  classId: z.string(),
  rollNumber: z.string().optional(),
  academicYear: z.string().default("2025-2026"),
  gender: z.string().optional(),
  bloodGroup: z.string().optional(),
  dateOfBirth: z.string().optional(),
  religion: z.string().optional(),
  nationality: z.string().optional(),
  fatherName: z.string().optional(),
  fatherPhone: z.string().optional(),
  fatherEmail: z.string().optional(),
  fatherOccupation: z.string().optional(),
  motherName: z.string().optional(),
  motherPhone: z.string().optional(),
  motherEmail: z.string().optional(),
  motherOccupation: z.string().optional(),
  primaryContact: z.enum(["FATHER", "MOTHER", "OTHER"]).default("FATHER"),
  previousSchool: z.string().optional(),
  previousGrade: z.string().optional(),
  tcNumber: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20"));
  const search = searchParams.get("search") ?? "";
  const classId = searchParams.get("classId") || undefined;
  const status = searchParams.get("status"); // "active" | "inactive" | null

  // Build AND conditions to avoid merging conflicting 'user' objects
  const conditions: object[] = [];
  if (session.user.schoolId) conditions.push({ user: { schoolId: session.user.schoolId } });
  if (classId) conditions.push({ classId });
  if (status === "active") conditions.push({ user: { isActive: true } });
  if (status === "inactive") conditions.push({ user: { isActive: false } });
  if (search) {
    conditions.push({
      OR: [
        { user: { name: { contains: search } } },
        { studentId: { contains: search } },
      ],
    });
  }
  const where = conditions.length > 0 ? { AND: conditions } : {};

  const [students, total] = await Promise.all([
    db.student.findMany({
      where,
      include: {
        user: { select: { name: true, email: true, phone: true, isActive: true, address: true } },
        class: { select: { id: true, name: true, section: true } },
        guardians: {
          where: { isPrimary: true },
          include: { guardian: { select: { id: true, name: true, relation: true, phone: true } } },
          take: 1,
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { user: { name: "asc" } },
    }),
    db.student.count({ where }),
  ]);

  return NextResponse.json({ students, total, page, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isSchoolStaff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const {
    name, email, password, phone, address, city, state, pincode,
    classId, rollNumber, academicYear,
    gender, bloodGroup, dateOfBirth, religion, nationality,
    fatherName, fatherPhone, fatherEmail, fatherOccupation,
    motherName, motherPhone, motherEmail, motherOccupation,
    primaryContact,
    previousSchool, previousGrade, tcNumber,
  } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const count = await db.student.count();
  const studentId = `STU${String(count + 1).padStart(4, "0")}`;
  const hashed = await bcrypt.hash(password?.trim() || "password123", 10);

  const fullAddress = [address, city, state, pincode].filter(Boolean).join(", ") || undefined;

  const user = await db.user.create({
    data: {
      name,
      email,
      password: hashed,
      role: "STUDENT",
      phone,
      address: fullAddress,
      schoolId: session.user.schoolId ?? undefined,
      student: {
        create: {
          studentId,
          classId,
          rollNumber,
          gender,
          bloodGroup: bloodGroup || undefined,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
          religion,
          nationality,
          previousSchool,
          previousGrade,
          tcNumber,
        },
      },
    },
    include: { student: true },
  });

  const student = user.student!;

  // Create guardians
  if (fatherName) {
    const guardian = await db.guardian.create({
      data: {
        name: fatherName,
        relation: "FATHER",
        phone: fatherPhone || "N/A",
        email: fatherEmail,
        occupation: fatherOccupation,
        schoolId: session.user.schoolId!,
      },
    });
    await db.studentGuardian.create({
      data: {
        studentId: student.id,
        guardianId: guardian.id,
        isPrimary: primaryContact === "FATHER",
      },
    });
  }

  if (motherName) {
    const guardian = await db.guardian.create({
      data: {
        name: motherName,
        relation: "MOTHER",
        phone: motherPhone || "N/A",
        email: motherEmail,
        occupation: motherOccupation,
        schoolId: session.user.schoolId!,
      },
    });
    await db.studentGuardian.create({
      data: {
        studentId: student.id,
        guardianId: guardian.id,
        isPrimary: primaryContact === "MOTHER",
      },
    });
  }

  // Create parent login account from primary guardian's email
  const primaryEmail = primaryContact === "MOTHER" ? motherEmail : fatherEmail;
  const primaryName  = primaryContact === "MOTHER" ? motherName  : fatherName;
  const primaryPhone = primaryContact === "MOTHER" ? motherPhone : fatherPhone;
  if (primaryEmail && primaryName && session.user.schoolId) {
    const parentId = await findOrCreateParentAccount({
      email: primaryEmail,
      name: primaryName,
      phone: primaryPhone || "N/A",
      schoolId: session.user.schoolId,
    });
    if (parentId) {
      await db.student.update({ where: { id: student.id }, data: { parentId } });
    }
  }

  // Create enrollment
  await db.enrollment.create({
    data: {
      studentId: student.id,
      classId,
      academicYear,
      rollNumber,
      status: "ACTIVE",
    },
  });

  const result = await db.student.findUnique({
    where: { id: student.id },
    include: {
      user: { select: { name: true, email: true, phone: true, isActive: true } },
      class: true,
      guardians: { include: { guardian: true } },
    },
  });

  return NextResponse.json(result, { status: 201 });
}
