import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function getGrade(pct: number): string {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 40) return "D";
  return "F";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: examId } = await params;
  const classId = req.nextUrl.searchParams.get("classId") ?? undefined;

  const papers = await db.examPaper.findMany({
    where: { examId, ...(classId && { classId }) },
    include: {
      subject: { select: { id: true, name: true } },
      class: { select: { id: true, name: true, section: true } },
      marks: {
        include: {
          student: { include: { user: { select: { name: true } } } },
        },
      },
    },
    orderBy: { subject: { name: "asc" } },
  });

  if (papers.length === 0) return NextResponse.json([]);

  // Collect all unique students across all papers in this class filter
  const studentMap = new Map<
    string,
    {
      studentId: string;
      studentName: string;
      classId: string;
      className: string;
      subjectMarks: Record<string, { obtained: number | null; max: number; passing: number; isAbsent: boolean }>;
    }
  >();

  for (const paper of papers) {
    for (const mark of paper.marks) {
      const sid = mark.studentId;
      if (!studentMap.has(sid)) {
        studentMap.set(sid, {
          studentId: sid,
          studentName: mark.student.user.name,
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

  const rows = Array.from(studentMap.values()).map((s) => {
    let totalObtained = 0;
    let totalMax = 0;
    let allEntered = true;

    for (const sub of subjects) {
      const sm = s.subjectMarks[sub.id];
      if (!sm) { allEntered = false; continue; }
      totalMax += sm.max;
      totalObtained += sm.isAbsent ? 0 : (sm.obtained ?? 0);
    }

    const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
    return {
      ...s,
      totalObtained,
      totalMax,
      percentage,
      grade: getGrade(percentage),
      allEntered,
    };
  });

  // Sort by percentage desc, assign rank
  rows.sort((a, b) => b.percentage - a.percentage);
  rows.forEach((r, i) => Object.assign(r, { rank: i + 1 }));

  return NextResponse.json({ subjects, rows });
}
