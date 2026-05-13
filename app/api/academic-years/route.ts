import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const years = await db.academicYear.findMany({
    where: { schoolId: session.user.schoolId! },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(years);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, startDate, endDate, isCurrent } = await req.json();
  if (!name || !startDate || !endDate) {
    return NextResponse.json({ error: "name, startDate, endDate required" }, { status: 400 });
  }

  if (isCurrent) {
    await db.academicYear.updateMany({
      where: { schoolId: session.user.schoolId! },
      data: { isCurrent: false },
    });
  }

  const year = await db.academicYear.create({
    data: {
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isCurrent: isCurrent ?? false,
      schoolId: session.user.schoolId!,
    },
  });
  return NextResponse.json(year, { status: 201 });
}
