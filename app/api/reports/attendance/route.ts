import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const classId = searchParams.get("classId") ?? undefined;
  const fromDate = searchParams.get("fromDate");
  const toDate = searchParams.get("toDate");
  const format = searchParams.get("format");

  const conditions: object[] = [
    { student: { user: { schoolId: session.user.schoolId! } } },
    { period: 0 },
  ];
  if (classId) conditions.push({ student: { classId } });
  if (fromDate) conditions.push({ date: { gte: new Date(fromDate) } });
  if (toDate) conditions.push({ date: { lte: new Date(toDate) } });

  const records = await db.attendance.findMany({
    where: { AND: conditions },
    include: {
      student: {
        include: {
          user: { select: { name: true } },
          class: { select: { id: true, name: true, section: true } },
        },
      },
    },
    orderBy: { date: "asc" },
  });

  type Row = { studentId: string; studentName: string; classId: string; className: string; PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number; total: number };
  const studentMap = new Map<string, Row>();

  for (const r of records) {
    const sid = r.studentId;
    if (!studentMap.has(sid)) {
      studentMap.set(sid, {
        studentId: sid,
        studentName: r.student.user.name,
        classId: r.student.classId,
        className: `${r.student.class.name} ${r.student.class.section}`,
        PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0,
      });
    }
    const row = studentMap.get(sid)!;
    const key = r.status as "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
    row[key] += 1;
    row.total += 1;
  }

  const students = Array.from(studentMap.values()).map((r) => ({
    ...r,
    percentage: r.total > 0 ? Math.round(((r.PRESENT + r.LATE) / r.total) * 100) : 0,
  }));

  // Class-wise aggregation for bar chart
  const classMap = new Map<string, { className: string; totalPct: number; count: number }>();
  for (const s of students) {
    if (!classMap.has(s.classId)) classMap.set(s.classId, { className: s.className, totalPct: 0, count: 0 });
    const c = classMap.get(s.classId)!;
    c.totalPct += s.percentage;
    c.count += 1;
  }
  const classChart = Array.from(classMap.values()).map((c) => ({
    className: c.className,
    percentage: c.count > 0 ? Math.round(c.totalPct / c.count) : 0,
    students: c.count,
  })).sort((a, b) => a.className.localeCompare(b.className));

  if (format === "csv") {
    const header = "Student Name,Class,Present,Absent,Late,Excused,Total,Attendance %";
    const rows = students.map((s) => [`"${s.studentName}"`, s.className, s.PRESENT, s.ABSENT, s.LATE, s.EXCUSED, s.total, `${s.percentage}%`].join(","));
    const csv = [header, ...rows].join("\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="attendance_report.csv"` },
    });
  }

  return NextResponse.json({ students, classChart });
}
