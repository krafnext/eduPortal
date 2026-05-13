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
  const periodMode = searchParams.get("periodMode") === "1";

  const conditions: object[] = [
    { student: { user: { schoolId: session.user.schoolId! } } },
  ];
  if (classId) conditions.push({ student: { classId } });
  if (fromDate) conditions.push({ date: { gte: new Date(fromDate) } });
  if (toDate) conditions.push({ date: { lte: new Date(toDate) } });
  if (!periodMode) conditions.push({ period: 0 });

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
    orderBy: [{ date: "asc" }, { student: { user: { name: "asc" } } }, { period: "asc" }],
    take: 10000,
  });

  const dateStr = (d: Date) => new Date(d).toISOString().split("T")[0];

  let header: string;
  let rows: string[];

  if (periodMode) {
    header = "Student Name,Admission No,Class,Date,Period,Status,Remarks";
    rows = records.map((r) =>
      [
        `"${r.student.user.name}"`,
        r.student.studentId ?? "",
        `"${r.student.class.name} ${r.student.class.section}"`,
        dateStr(r.date),
        r.period > 0 ? `P${r.period}` : "Daily",
        r.status,
        r.remarks ? `"${r.remarks}"` : "",
      ].join(",")
    );
  } else {
    header = "Student Name,Admission No,Class,Date,Status,Remarks";
    rows = records.map((r) =>
      [
        `"${r.student.user.name}"`,
        r.student.studentId ?? "",
        `"${r.student.class.name} ${r.student.class.section}"`,
        dateStr(r.date),
        r.status,
        r.remarks ? `"${r.remarks}"` : "",
      ].join(",")
    );
  }

  const csv = [header, ...rows].join("\n");
  const fileName = `attendance_${fromDate ?? "all"}_to_${toDate ?? "all"}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
