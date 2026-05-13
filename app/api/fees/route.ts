import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // "structure" | "payments"

  if (type === "structure") {
    const structures = await db.feeStructure.findMany({
      include: { class: true, _count: { select: { payments: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(structures);
  }

  const studentId = searchParams.get("studentId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const payments = await db.feePayment.findMany({
    where: {
      ...(studentId ? { studentId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: {
      student: { include: { user: { select: { name: true } } } },
      feeStructure: { include: { class: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(payments);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "ADMIN", "STAFF"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  if (action === "create_structure") {
    const { classId, feeType, amount, academicYear, dueDate, description } = body;
    const structure = await db.feeStructure.create({
      data: { classId, feeType, amount, academicYear: academicYear ?? "2025-2026", dueDate: dueDate ? new Date(dueDate) : null, description },
    });
    return NextResponse.json(structure, { status: 201 });
  }

  if (action === "record_payment") {
    const { studentId, feeStructureId, paidAmount, transactionId, remarks } = body;
    const payment = await db.feePayment.create({
      data: {
        studentId, feeStructureId, paidAmount,
        status: "PAID",
        transactionId, remarks,
      },
    });
    return NextResponse.json(payment, { status: 201 });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
