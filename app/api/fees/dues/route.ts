import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const classId = searchParams.get("classId") ?? undefined;
  const academicYear = searchParams.get("academicYear") ?? undefined;

  const invoices = await db.invoice.findMany({
    where: {
      schoolId: session.user.schoolId!,
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      ...(classId && { classId }),
      ...(academicYear && { academicYear }),
    },
    include: {
      student: {
        include: {
          user: { select: { name: true } },
          class: { select: { name: true, section: true } },
        },
      },
      class: { select: { name: true, section: true } },
      payments: { orderBy: { paymentDate: "desc" }, take: 1 },
    },
    orderBy: { dueDate: "asc" },
    take: 500,
  });

  // Aggregate by student
  const map = new Map<
    string,
    {
      studentId: string;
      studentName: string;
      class: string;
      totalDue: number;
      paid: number;
      balance: number;
      invoiceCount: number;
      lastPayment: string | null;
      overdueSince: string | null;
    }
  >();

  const now = new Date();
  for (const inv of invoices) {
    const sid = inv.studentId;
    const balance = inv.totalAmount - inv.paidAmount;
    const lastPmt = inv.payments[0]?.paymentDate.toISOString() ?? null;
    const overdue = inv.dueDate < now && inv.status !== "PAID" ? inv.dueDate.toISOString() : null;

    if (map.has(sid)) {
      const row = map.get(sid)!;
      row.totalDue += inv.totalAmount;
      row.paid += inv.paidAmount;
      row.balance += balance;
      row.invoiceCount += 1;
      if (lastPmt && (!row.lastPayment || lastPmt > row.lastPayment)) row.lastPayment = lastPmt;
      if (overdue && (!row.overdueSince || overdue < row.overdueSince)) row.overdueSince = overdue;
    } else {
      map.set(sid, {
        studentId: sid,
        studentName: inv.student.user.name,
        class: `${inv.student.class.name} ${inv.student.class.section}`,
        totalDue: inv.totalAmount,
        paid: inv.paidAmount,
        balance,
        invoiceCount: 1,
        lastPayment: lastPmt,
        overdueSince: overdue,
      });
    }
  }

  return NextResponse.json(Array.from(map.values()).sort((a, b) => b.balance - a.balance));
}
