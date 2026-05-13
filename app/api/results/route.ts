import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGrade } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const examId = searchParams.get("examId");
  const studentId = searchParams.get("studentId");

  const results = await db.examResult.findMany({
    where: {
      ...(examId ? { examId } : {}),
      ...(studentId ? { studentId } : {}),
    },
    include: {
      exam: { include: { subject: true, class: true } },
      student: { include: { user: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["TEACHER", "SCHOOL_ADMIN", "ADMIN", "STAFF"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { results } = await req.json();
  // results: [{ examId, studentId, marksObtained, remarks? }]

  const upserts = results.map(async (r: { examId: string; studentId: string; marksObtained: number; remarks?: string }) => {
    const exam = await db.exam.findUnique({ where: { id: r.examId } });
    const grade = exam ? getGrade(r.marksObtained, exam.totalMarks) : undefined;

    return db.examResult.upsert({
      where: { examId_studentId: { examId: r.examId, studentId: r.studentId } },
      create: { examId: r.examId, studentId: r.studentId, marksObtained: r.marksObtained, grade, remarks: r.remarks },
      update: { marksObtained: r.marksObtained, grade, remarks: r.remarks },
    });
  });

  const saved = await Promise.all(upserts);
  return NextResponse.json(saved, { status: 201 });
}
