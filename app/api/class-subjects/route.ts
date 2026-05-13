import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const classId = req.nextUrl.searchParams.get("classId");
  if (!classId) return NextResponse.json({ error: "classId required" }, { status: 400 });

  const mappings = await db.classSubject.findMany({
    where: { classId },
    include: { subject: true },
  });
  return NextResponse.json(mappings);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { classId, subjectIds } = await req.json();
  if (!classId || !Array.isArray(subjectIds)) {
    return NextResponse.json({ error: "classId and subjectIds[] required" }, { status: 400 });
  }

  await db.classSubject.deleteMany({ where: { classId } });

  if (subjectIds.length > 0) {
    await db.classSubject.createMany({
      data: subjectIds.map((subjectId: string) => ({ classId, subjectId })),
    });
  }

  const mappings = await db.classSubject.findMany({
    where: { classId },
    include: { subject: true },
  });
  return NextResponse.json(mappings);
}
