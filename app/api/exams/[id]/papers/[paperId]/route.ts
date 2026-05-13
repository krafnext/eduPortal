import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paperId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "SCHOOL_ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { paperId } = await params;
  const { maxMarks, passingMarks } = await req.json();

  const paper = await db.examPaper.update({
    where: { id: paperId },
    data: {
      ...(maxMarks !== undefined && { maxMarks }),
      ...(passingMarks !== undefined && { passingMarks }),
    },
  });
  return NextResponse.json(paper);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; paperId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "SCHOOL_ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { paperId } = await params;
  await db.examPaper.delete({ where: { id: paperId } });
  return NextResponse.json({ ok: true });
}
