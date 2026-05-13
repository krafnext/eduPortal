import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [students, teachers, classes, notices, events, pendingFees, issuedBooks] = await Promise.all([
    db.student.count(),
    db.teacher.count(),
    db.class.count(),
    db.notice.count({ where: { isActive: true } }),
    db.event.count({ where: { isActive: true, date: { gte: new Date() } } }),
    db.feePayment.count({ where: { status: "PENDING" } }),
    db.bookIssue.count({ where: { status: "ISSUED" } }),
  ]);

  return NextResponse.json({ students, teachers, classes, notices, events, pendingFees, issuedBooks });
}
