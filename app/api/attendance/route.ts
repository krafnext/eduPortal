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
  const studentId = searchParams.get("studentId");
  const date = searchParams.get("date");
  const fromDate = searchParams.get("fromDate");
  const toDate = searchParams.get("toDate");
  const period = searchParams.get("period");

  const conditions: object[] = [];

  if (session.user.schoolId) {
    conditions.push({ student: { user: { schoolId: session.user.schoolId } } });
  }
  if (studentId) conditions.push({ studentId });
  if (classId) conditions.push({ student: { classId } });
  if (date) conditions.push({ date: new Date(date) });
  if (fromDate || toDate) {
    conditions.push({
      date: {
        ...(fromDate && { gte: new Date(fromDate) }),
        ...(toDate && { lte: new Date(toDate) }),
      },
    });
  }
  if (period !== null && period !== undefined) conditions.push({ period: parseInt(period) });

  const records = await db.attendance.findMany({
    where: conditions.length > 0 ? { AND: conditions } : {},
    include: {
      student: {
        include: {
          user: { select: { name: true } },
          class: { select: { name: true, section: true } },
        },
      },
    },
    orderBy: [{ date: "desc" }, { student: { user: { name: "asc" } } }],
    take: 500,
  });

  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["TEACHER", "ADMIN", "SCHOOL_ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { records, date, period = 0 } = await req.json();

  if (!records || !Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: "No attendance records provided" }, { status: 400 });
  }
  if (!date) return NextResponse.json({ error: "Date is required" }, { status: 400 });

  let teacherId: string | null = null;
  if (session.user.role === "TEACHER") {
    const teacher = await db.teacher.findUnique({ where: { userId: session.user.id } });
    if (teacher) teacherId = teacher.id;
  }

  const parsedDate = new Date(date);
  const upserts = records.map((r: { studentId: string; status: string; remarks?: string }) =>
    db.attendance.upsert({
      where: { studentId_date_period: { studentId: r.studentId, date: parsedDate, period } },
      create: {
        studentId: r.studentId,
        teacherId: teacherId ?? null,
        date: parsedDate,
        status: r.status as never,
        period,
        markedBy: session.user.id,
        remarks: r.remarks ?? null,
      },
      update: {
        status: r.status as never,
        remarks: r.remarks ?? null,
        markedBy: session.user.id,
      },
    })
  );

  const results = await Promise.all(upserts);
  return NextResponse.json(results, { status: 201 });
}
