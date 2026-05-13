import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const levels = await db.classLevel.findMany({
    where: { schoolId: session.user.schoolId! },
    include: { _count: { select: { sections: true } } },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(levels);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, order, description } = await req.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const level = await db.classLevel.create({
    data: {
      name,
      order: order ?? 0,
      description: description ?? null,
      schoolId: session.user.schoolId!,
    },
  });
  return NextResponse.json(level, { status: 201 });
}
