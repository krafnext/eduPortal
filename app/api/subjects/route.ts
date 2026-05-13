import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subjects = await db.subject.findMany({
    include: { teacher: { include: { user: { select: { name: true } } } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(subjects);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, code, teacherId, type, isElective } = await req.json();
  if (!name || !code) return NextResponse.json({ error: "name and code required" }, { status: 400 });

  const subject = await db.subject.create({
    data: {
      name,
      code,
      teacherId: teacherId || null,
      type: type ?? "THEORY",
      isElective: isElective ?? false,
    },
  });
  return NextResponse.json(subject, { status: 201 });
}
