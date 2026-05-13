import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  studentId: z.string(),
  classId: z.string(),
  academicYear: z.string().default("2025-2026"),
  rollNumber: z.string().optional(),
  status: z.string().default("ACTIVE"),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { studentId, classId, academicYear, rollNumber, status } = parsed.data;

  const enrollment = await db.enrollment.upsert({
    where: { studentId_academicYear: { studentId, academicYear } },
    create: { studentId, classId, academicYear, rollNumber, status },
    update: { classId, rollNumber, status },
    include: { class: true },
  });

  // Update student's current classId for the active year
  if (academicYear === "2025-2026") {
    await db.student.update({ where: { id: studentId }, data: { classId, rollNumber } });
  }

  return NextResponse.json(enrollment, { status: 201 });
}
