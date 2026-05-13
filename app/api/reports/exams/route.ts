import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function getGrade(pct: number) {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 40) return "D";
  return "F";
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const examId = searchParams.get("examId");
  const classId = searchParams.get("classId") ?? undefined;
  const format = searchParams.get("format");

  if (!examId) {
    // Return list of exams for the school
    const exams = await db.exam.findMany({
      where: { school: { users: { some: { id: session.user.id } } } },
      select: { id: true, name: true, academicYear: true, status: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ exams });
  }

  const exam = await db.exam.findUnique({
    where: { id: examId },
    select: { name: true, academicYear: true, startDate: true, endDate: true, status: true },
  });
  if (!exam) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const papers = await db.examPaper.findMany({
    where: { examId, ...(classId && { classId }) },
    include: {
      subject: { select: { id: true, name: true } },
      class: { select: { id: true, name: true, section: true } },
      marks: { include: { student: { include: { user: { select: { name: true } } } } } },
    },
    orderBy: { subject: { name: "asc" } },
  });

  // Collect all students
  const studentMap = new Map<string, { name: string; classId: string; className: string; subjectMarks: Record<string, { obtained: number | null; max: number; passing: number; isAbsent: boolean }> }>();
  for (const paper of papers) {
    for (const mark of paper.marks) {
      const sid = mark.studentId;
      if (!studentMap.has(sid)) {
        studentMap.set(sid, {
          name: mark.student.user.name,
          classId: paper.classId,
          className: `${paper.class.name} ${paper.class.section}`,
          subjectMarks: {},
        });
      }
      studentMap.get(sid)!.subjectMarks[paper.subject.id] = {
        obtained: mark.isAbsent ? null : (mark.marksObtained ?? null),
        max: paper.maxMarks,
        passing: paper.passingMarks,
        isAbsent: mark.isAbsent,
      };
    }
  }

  const subjects = papers.map((p) => ({ id: p.subject.id, name: p.subject.name }));

  const rows = Array.from(studentMap.entries()).map(([sid, s]) => {
    let totalObtained = 0, totalMax = 0;
    for (const sub of subjects) {
      const sm = s.subjectMarks[sub.id];
      if (!sm) continue;
      totalMax += sm.max;
      totalObtained += sm.isAbsent ? 0 : (sm.obtained ?? 0);
    }
    const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
    return { studentId: sid, name: s.name, className: s.className, subjectMarks: s.subjectMarks, totalObtained, totalMax, percentage, grade: getGrade(percentage) };
  });

  rows.sort((a, b) => b.percentage - a.percentage);
  rows.forEach((r, i) => Object.assign(r, { rank: i + 1 }));

  const pass = rows.filter((r) => r.grade !== "F").length;
  const fail = rows.length - pass;
  const avgPct = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.percentage, 0) / rows.length) : 0;
  const topper = rows[0] ?? null;

  // Subject averages for bar chart
  const subjectAverages = subjects.map((sub) => {
    const marks = rows.map((r) => r.subjectMarks[sub.id]).filter((m) => m && !m.isAbsent && m.obtained !== null) as { obtained: number; max: number }[];
    const avg = marks.length > 0 ? Math.round(marks.reduce((s, m) => s + ((m.obtained / m.max) * 100), 0) / marks.length) : 0;
    return { subject: sub.name, average: avg, count: marks.length };
  });

  // Grade distribution for pie chart
  const gradeCounts: Record<string, number> = {};
  for (const r of rows) gradeCounts[r.grade] = (gradeCounts[r.grade] ?? 0) + 1;
  const gradeDistribution = ["A+", "A", "B+", "B", "C", "D", "F"].filter((g) => gradeCounts[g]).map((g) => ({ grade: g, count: gradeCounts[g] }));

  if (format === "csv") {
    const subjectHeaders = subjects.map((s) => s.name).join(",");
    const header = `Rank,Student,Class,${subjectHeaders},Total,Percentage,Grade`;
    const csvRows = rows.map((r) => {
      const subCols = subjects.map((s) => {
        const sm = r.subjectMarks[s.id];
        if (!sm) return "";
        return sm.isAbsent ? "AB" : (sm.obtained ?? "");
      }).join(",");
      return [`${(r as unknown as { rank: number }).rank}`, `"${r.name}"`, r.className, subCols, r.totalObtained, `${r.percentage}%`, r.grade].join(",");
    });
    const csv = [header, ...csvRows].join("\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="exam_report.csv"` },
    });
  }

  return NextResponse.json({
    exam,
    summary: { total: rows.length, pass, fail, avgPct, topperName: topper?.name ?? null, topperPct: topper?.percentage ?? null },
    subjectAverages,
    gradeDistribution,
    subjects,
    rows,
  });
}
