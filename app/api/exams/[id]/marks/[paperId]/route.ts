import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; paperId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { paperId } = await params;

  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    include: {
      subject: { select: { name: true, code: true } },
      class: {
        select: {
          id: true,
          name: true,
          section: true,
          students: {
            include: { user: { select: { name: true } } },
            orderBy: { user: { name: "asc" } },
          },
        },
      },
      marks: true,
    },
  });
  if (!paper) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(paper);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paperId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "SCHOOL_ADMIN", "TEACHER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { paperId } = await params;
  const { marks, isDraft } = await req.json() as {
    marks: { studentId: string; marksObtained: number | null; isAbsent: boolean }[];
    isDraft: boolean;
  };

  if (!Array.isArray(marks) || marks.length === 0) {
    return NextResponse.json({ error: "No marks provided" }, { status: 400 });
  }

  const upserts = marks.map((m) =>
    db.mark.upsert({
      where: { paperId_studentId: { paperId, studentId: m.studentId } },
      create: {
        paperId,
        studentId: m.studentId,
        marksObtained: m.isAbsent ? null : (m.marksObtained ?? null),
        isAbsent: m.isAbsent,
        isDraft: isDraft ?? true,
      },
      update: {
        marksObtained: m.isAbsent ? null : (m.marksObtained ?? null),
        isAbsent: m.isAbsent,
        isDraft: isDraft ?? true,
      },
    })
  );

  const results = await db.$transaction(upserts);
  return NextResponse.json(results);
}
