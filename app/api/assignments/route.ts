import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get("classId") ?? undefined;
  const teacherId = searchParams.get("teacherId") ?? undefined;

  const assignments = await db.assignment.findMany({
    where: { ...(classId ? { classId } : {}), ...(teacherId ? { teacherId } : {}) },
    include: {
      class: true, subject: true,
      teacher: { include: { user: { select: { name: true } } } },
      _count: { select: { submissions: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  return NextResponse.json(assignments);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["TEACHER", "SCHOOL_ADMIN", "ADMIN", "STAFF"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, classId, subjectId, dueDate } = body;

  let teacherId = body.teacherId;
  if (!teacherId && session.user.role === "TEACHER") {
    const teacher = await db.teacher.findUnique({ where: { userId: session.user.id } });
    teacherId = teacher?.id;
  }

  if (!teacherId) return NextResponse.json({ error: "Teacher not found" }, { status: 400 });

  const assignment = await db.assignment.create({
    data: { title, description, classId, subjectId, teacherId, dueDate: new Date(dueDate) },
    include: { class: true, subject: true },
  });

  return NextResponse.json(assignment, { status: 201 });
}
