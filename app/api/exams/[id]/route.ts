import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const exam = await db.exam.findUnique({
    where: { id },
    include: {
      school: { select: { name: true, principalName: true, phone: true, email: true } },
      papers: {
        include: {
          subject: { select: { id: true, name: true, code: true } },
          class: { select: { id: true, name: true, section: true } },
          _count: { select: { marks: true } },
        },
        orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
      },
      _count: { select: { papers: true } },
    },
  });
  if (!exam) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(exam);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "SCHOOL_ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { name, academicYear, startDate, endDate, weightage, status } = await req.json();

  const exam = await db.exam.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(academicYear && { academicYear }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(weightage !== undefined && { weightage }),
      ...(status && { status }),
    },
  });

  return NextResponse.json(exam);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "SCHOOL_ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await db.exam.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
