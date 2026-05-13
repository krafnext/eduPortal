import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function isSchoolStaff(role: string) {
  return ["SCHOOL_ADMIN", "ADMIN", "STAFF"].includes(role);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const student = await db.student.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true, phone: true, address: true, isActive: true, schoolId: true } },
      class: true,
      guardians: {
        include: { guardian: true },
        orderBy: { isPrimary: "desc" },
      },
      documents: { orderBy: { createdAt: "desc" } },
      enrollments: { include: { class: true }, orderBy: { createdAt: "desc" } },
      attendance: { orderBy: { date: "desc" }, take: 30 },
      results: {
        include: { exam: { include: { subject: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      feePayments: { include: { feeStructure: true }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(student);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !isSchoolStaff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const {
    name, phone, address,
    classId, rollNumber, gender, bloodGroup, religion, nationality,
    photo, previousSchool, previousGrade, tcNumber,
  } = body;

  const student = await db.student.findUnique({ where: { id } });
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.user.update({ where: { id: student.userId }, data: { name, phone, address } });
  const updated = await db.student.update({
    where: { id },
    data: {
      classId, rollNumber, gender, bloodGroup, religion, nationality,
      photo, previousSchool, previousGrade, tcNumber,
    },
    include: {
      user: { select: { name: true, email: true, phone: true, address: true, isActive: true } },
      class: true,
      guardians: { include: { guardian: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !isSchoolStaff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const student = await db.student.findUnique({ where: { id } });
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.user.update({ where: { id: student.userId }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
