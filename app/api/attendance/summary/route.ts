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
          class: { select: { name: true, section: true } },
        },
      },
    },
  });

  // Aggregate per student
  const map = new Map<
    string,
    { studentId: string; studentName: string; class: string; PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number; total: number }
  >();

  for (const r of records) {
    const sid = r.studentId;
    if (!map.has(sid)) {
      map.set(sid, {
        studentId: sid,
        studentName: r.student.user.name,
        class: `${r.student.class.name} ${r.student.class.section}`,
        PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0,
      });
    }
    const row = map.get(sid)!;
    const key = r.status as "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
    row[key] += 1;
    row.total += 1;
  }

  const rows = Array.from(map.values()).map((r) => ({
    ...r,
    percentage: r.total > 0 ? Math.round(((r.PRESENT + r.LATE) / r.total) * 100) : 0,
  }));

  rows.sort((a, b) => a.percentage - b.percentage);

  return NextResponse.json(rows);
}
