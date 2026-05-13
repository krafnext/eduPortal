import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString("default", { month: "short", year: "2-digit" });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const classId = searchParams.get("classId") ?? undefined;
  const fromDate = searchParams.get("fromDate");
  const toDate = searchParams.get("toDate");
  const paymentMode = searchParams.get("paymentMode") ?? undefined;
  const format = searchParams.get("format");

  const invConditions: object[] = [{ schoolId: session.user.schoolId! }];
  if (classId) invConditions.push({ classId });
  if (fromDate) invConditions.push({ createdAt: { gte: new Date(fromDate) } });
  if (toDate) invConditions.push({ createdAt: { lte: new Date(toDate) } });

  const invoices = await db.invoice.findMany({
    where: { AND: invConditions },
    include: {
      student: {
        include: {
          user: { select: { name: true } },
          class: { select: { name: true, section: true } },
        },
      },
      payments: paymentMode ? { where: { paymentMode: paymentMode as never } } : true,
    },
    orderBy: { createdAt: "asc" },
  });

  const totalBilled = invoices.reduce((s, i) => s + i.totalAmount, 0);
  const totalCollected = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const outstanding = totalBilled - totalCollected;
  const overdueCount = invoices.filter((i) => i.status === "OVERDUE").length;

  // Monthly collection from payments
  const allPayments = invoices.flatMap((inv) =>
    inv.payments.map((p) => ({ ...p, invoiceAmount: inv.totalAmount }))
  );
  const monthlyMap = new Map<string, { billed: number; collected: number }>();
  for (const inv of invoices) {
    const k = monthKey(inv.createdAt);
    if (!monthlyMap.has(k)) monthlyMap.set(k, { billed: 0, collected: 0 });
    monthlyMap.get(k)!.billed += inv.totalAmount;
  }
  for (const p of allPayments) {
    const k = monthKey(p.paymentDate);
    if (!monthlyMap.has(k)) monthlyMap.set(k, { billed: 0, collected: 0 });
    monthlyMap.get(k)!.collected += p.amount;
  }
  const monthlyCollection = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({ month: monthLabel(k), ...v }));

  // Class-wise outstanding
  const classDuesMap = new Map<string, { className: string; outstanding: number }>();
  for (const inv of invoices) {
    const key = `${inv.student.class.name} ${inv.student.class.section}`;
    if (!classDuesMap.has(key)) classDuesMap.set(key, { className: key, outstanding: 0 });
    classDuesMap.get(key)!.outstanding += inv.totalAmount - inv.paidAmount;
  }
  const classDues = Array.from(classDuesMap.values())
    .filter((c) => c.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  // Defaulters
  const defaulters = invoices
    .filter((i) => i.totalAmount - i.paidAmount > 0)
    .map((i) => ({
      studentName: i.student.user.name,
      className: `${i.student.class.name} ${i.student.class.section}`,
      invoiceNo: i.invoiceNo,
      totalBilled: i.totalAmount,
      totalPaid: i.paidAmount,
      outstanding: i.totalAmount - i.paidAmount,
      status: i.status,
      dueDate: i.dueDate,
    }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 50);

  if (format === "csv") {
    const header = "Student,Class,Invoice No,Total Billed,Total Paid,Outstanding,Status,Due Date";
    const rows = defaulters.map((d) => [`"${d.studentName}"`, d.className, d.invoiceNo, d.totalBilled.toFixed(2), d.totalPaid.toFixed(2), d.outstanding.toFixed(2), d.status, new Date(d.dueDate).toLocaleDateString()].join(","));
    const csv = [header, ...rows].join("\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="fees_report.csv"` },
    });
  }

  return NextResponse.json({ summary: { totalBilled, totalCollected, outstanding, overdueCount }, monthlyCollection, classDues, defaulters });
}
