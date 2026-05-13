import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const classId = searchParams.get("classId");
  const academicYear = searchParams.get("academicYear") ?? "2025-2026";

  const assignments = await db.teacherAssignment.findMany({
    where: {
      ...(classId && { classId }),
      academicYear,
    },
    include: {
      teacher: { include: { user: { select: { name: true } } } },
      class: true,
      subject: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(assignments);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { teacherId, classId, subjectId, academicYear } = await req.json();
  if (!teacherId || !classId || !subjectId) {
    return NextResponse.json({ error: "teacherId, classId, subjectId required" }, { status: 400 });
  }

  const assignment = await db.teacherAssignment.upsert({
    where: { classId_subjectId_academicYear: { classId, subjectId, academicYear: academicYear ?? "2025-2026" } },
    update: { teacherId },
    create: { teacherId, classId, subjectId, academicYear: academicYear ?? "2025-2026" },
    include: {
      teacher: { include: { user: { select: { name: true } } } },
      class: true,
      subject: true,
    },
  });
  return NextResponse.json(assignment, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const classId = searchParams.get("classId");
  const subjectId = searchParams.get("subjectId");
  const academicYear = searchParams.get("academicYear") ?? "2025-2026";

  if (!classId || !subjectId) {
    return NextResponse.json({ error: "classId and subjectId required" }, { status: 400 });
  }

  await db.teacherAssignment.deleteMany({ where: { classId, subjectId, academicYear } });
  return NextResponse.json({ success: true });
}
