import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  qualification: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const current = searchParams.get("current") === "true";

  // If requesting current teacher's assigned classes
  if (current) {
    const teacher = await db.teacher.findUnique({
      where: { userId: session.user.id },
      include: {
        timetables: {
          include: { class: true },
          distinct: ["classId"],
        },
      },
    });

    if (!teacher) {
      return NextResponse.json({ error: "Teacher profile not found" }, { status: 404 });
    }

    const assignedClasses = Array.from(
      new Map(teacher.timetables.map((t) => [t.classId, t.class])).values()
    );

    return NextResponse.json({ assignedClasses });
  }

  const teachers = await db.teacher.findMany({
    where: search ? { user: { name: { contains: search } } } : {},
    include: {
      user: { select: { name: true, email: true, phone: true, isActive: true } },
      subjects: true,
      _count: { select: { assignments: true, exams: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(teachers);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "ADMIN", "STAFF"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, email, password, phone, department, qualification } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const count = await db.teacher.count();
  const employeeId = `EMP${String(count + 1).padStart(4, "0")}`;
  const hashed = await bcrypt.hash(password?.trim() || "password123", 10);

  const user = await db.user.create({
    data: {
      name, email, password: hashed, role: "TEACHER", phone,
      teacher: { create: { employeeId, department, qualification } },
    },
    include: { teacher: true },
  });

  return NextResponse.json(user, { status: 201 });
}
