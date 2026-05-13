import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const studentId = searchParams.get("studentId") ?? undefined;
  const invoiceId = searchParams.get("invoiceId") ?? undefined;

  const payments = await db.payment.findMany({
    where: {
      ...(invoiceId && { invoiceId }),
      ...(studentId && { invoice: { studentId } }),
      invoice: { schoolId: session.user.schoolId! },
    },
    include: {
      invoice: {
        include: {
          student: { include: { user: { select: { name: true } } } },
          class: { select: { name: true, section: true } },
        },
      },
    },
    orderBy: { paymentDate: "desc" },
    take: 100,
  });
  return NextResponse.json(payments);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { invoiceId, amount, paymentMode, reference, paymentDate, remarks } = await req.json();
  if (!invoiceId || !amount) return NextResponse.json({ error: "invoiceId and amount required" }, { status: 400 });

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, schoolId: session.user.schoolId! },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const paymentCount = await db.payment.count({ where: { invoice: { schoolId: session.user.schoolId! } } });
  const year = new Date().getFullYear();
  const seq = (paymentCount + 1).toString().padStart(4, "0");
  const receiptNumber = `RCP-${year}-${seq}`;

  const paidFloat = parseFloat(amount);
  const newPaid = invoice.paidAmount + paidFloat;
  const newStatus = newPaid >= invoice.totalAmount ? "PAID" : newPaid > 0 ? "PARTIAL" : "PENDING";

  const [payment] = await db.$transaction([
    db.payment.create({
      data: {
        invoiceId,
        receiptNumber,
        amount: paidFloat,
        paymentMode: paymentMode ?? "CASH",
        reference: reference || null,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        remarks: remarks || null,
      },
    }),
    db.invoice.update({
      where: { id: invoiceId },
      data: { paidAmount: newPaid, status: newStatus as never },
    }),
  ]);

  return NextResponse.json(payment, { status: 201 });
}
