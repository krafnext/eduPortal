import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString("default", { month: "short", year: "numeric" });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const studentId = searchParams.get("studentId");

  if (!studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });

  const student = await db.student.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { name: true, email: true, avatar: true } },
      class: { select: { name: true, section: true } },
    },
  });
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [invoices, attendance, examResults] = await Promise.all([
    db.invoice.findMany({
      where: { studentId },
      include: { payments: { orderBy: { paymentDate: "desc" } } },
      orderBy: { createdAt: "desc" },
    }),
    db.attendance.findMany({
      where: { studentId, period: 0 },
      select: { date: true, status: true },
      orderBy: { date: "asc" },
    }),
    db.mark.findMany({
      where: { studentId },
      include: {
        paper: {
          include: {
            exam: { select: { name: true, academicYear: true, startDate: true } },
            subject: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Fee summary
  const totalBilled = invoices.reduce((s, i) => s + i.totalAmount, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const balance = totalBilled - totalPaid;

  // Attendance monthly grouping
  const monthMap = new Map<string, { PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number; total: number }>();
  for (const a of attendance) {
    const k = monthKey(new Date(a.date));
    if (!monthMap.has(k)) monthMap.set(k, { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0 });
    const m = monthMap.get(k)!;
    const key = a.status as "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
    m[key] += 1;
    m.total += 1;
  }
  const monthlyAttendance = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({ month: monthLabel(k), ...v, percentage: v.total > 0 ? Math.round(((v.PRESENT + v.LATE) / v.total) * 100) : 0 }));

  const attTotal = attendance.length;
  const attPresent = attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
  const attAbsent = attendance.filter((a) => a.status === "ABSENT").length;

  // Exam results
  const results = examResults.map((m) => ({
    examName: m.paper.exam.name,
    academicYear: m.paper.exam.academicYear,
    examDate: m.paper.exam.startDate,
    subject: m.paper.subject.name,
    maxMarks: m.paper.maxMarks,
    obtained: m.isAbsent ? null : m.marksObtained,
    isAbsent: m.isAbsent,
    isDraft: m.isDraft,
    percentage: !m.isAbsent && m.marksObtained != null ? Math.round((m.marksObtained / m.paper.maxMarks) * 100) : null,
  }));

  return NextResponse.json({
    student: {
      name: student.user.name,
      email: student.user.email,
      admissionNo: student.studentId,
      className: `${student.class.name} ${student.class.section}`,
      rollNumber: student.rollNumber,
      avatar: student.user.avatar,
    },
    fees: { invoices, totalBilled, totalPaid, balance },
    attendance: {
      monthly: monthlyAttendance,
      summary: { total: attTotal, present: attPresent, absent: attAbsent, percentage: attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : 0 },
    },
    results,
  });
}
