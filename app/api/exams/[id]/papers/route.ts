import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const papers = await db.examPaper.findMany({
    where: { examId: id },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      class: { select: { id: true, name: true, section: true } },
      _count: { select: { marks: true } },
    },
    orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
  });
  return NextResponse.json(papers);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "SCHOOL_ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: examId } = await params;
  const { subjectId, classId, maxMarks, passingMarks } = await req.json();

  if (!subjectId || !classId) {
    return NextResponse.json({ error: "subjectId and classId are required" }, { status: 400 });
  }

  const paper = await db.examPaper.upsert({
    where: { examId_subjectId_classId: { examId, subjectId, classId } },
    create: { examId, subjectId, classId, maxMarks: maxMarks ?? 100, passingMarks: passingMarks ?? 40 },
    update: { maxMarks: maxMarks ?? 100, passingMarks: passingMarks ?? 40 },
    include: {
      subject: { select: { name: true, code: true } },
      class: { select: { name: true, section: true } },
    },
  });

  return NextResponse.json(paper, { status: 201 });
}
