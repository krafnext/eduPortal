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
  const classId = searchParams.get("classId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const academicYear = searchParams.get("academicYear") ?? undefined;
  const period = searchParams.get("period") ?? undefined;

  const invoices = await db.invoice.findMany({
    where: {
      schoolId: session.user.schoolId!,
      ...(studentId && { studentId }),
      ...(classId && { classId }),
      ...(status && { status: status as never }),
      ...(academicYear && { academicYear }),
      ...(period && { period }),
    },
    include: {
      student: { include: { user: { select: { name: true, email: true } } } },
      class: { select: { name: true, section: true } },
      payments: { orderBy: { paymentDate: "desc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(invoices);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { classIds, period, academicYear, dueDate, preview } = await req.json();
  if (!period || !academicYear || !dueDate) {
    return NextResponse.json({ error: "period, academicYear, dueDate required" }, { status: 400 });
  }

  const schoolId = session.user.schoolId!;

  const classWhere = classIds?.length > 0
    ? { id: { in: classIds } }
    : {};

  const students = await db.student.findMany({
    where: {
      user: { schoolId },
      ...(classIds?.length > 0 ? { classId: { in: classIds } } : {}),
    },
    include: { user: { select: { name: true } }, class: true },
  });

  const structures = await db.feeStructure.findMany({
    where: {
      schoolId,
      academicYear,
      ...(classIds?.length > 0
        ? { OR: [{ classId: { in: classIds } }, { classId: null }] }
        : { OR: [{ classId: null }, {}] }),
    },
  });

  const buildItems = (classId: string) =>
    structures
      .filter((s) => s.classId === null || s.classId === classId)
      .map((s) => ({ name: s.name ?? s.feeType, feeType: s.feeType, amount: s.amount }));

  if (preview) {
    return NextResponse.json(
      students.map((s) => {
        const items = buildItems(s.classId);
        return {
          studentId: s.id,
          studentName: s.user.name,
          class: `${s.class.name} ${s.class.section}`,
          items,
          total: items.reduce((sum, i) => sum + i.amount, 0),
        };
      })
    );
  }

  // Count existing invoices for sequence
  const count = await db.invoice.count({ where: { schoolId } });
  const year = new Date().getFullYear();

  const created: string[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const items = buildItems(s.classId);
    if (items.length === 0) continue;

    const existing = await db.invoice.findUnique({
      where: { studentId_period_academicYear: { studentId: s.id, period, academicYear } },
    });
    if (existing) { skipped.push(s.id); continue; }

    const seq = (count + created.length + 1).toString().padStart(4, "0");
    await db.invoice.create({
      data: {
        invoiceNo: `INV-${year}-${seq}`,
        studentId: s.id,
        classId: s.classId,
        items,
        totalAmount: items.reduce((sum, it) => sum + it.amount, 0),
        paidAmount: 0,
        dueDate: new Date(dueDate),
        academicYear,
        period,
        status: "PENDING",
        schoolId,
      },
    });
    created.push(s.id);
  }

  return NextResponse.json({ created: created.length, skipped: skipped.length }, { status: 201 });
}
