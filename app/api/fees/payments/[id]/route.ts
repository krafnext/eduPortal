import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const payment = await db.payment.findFirst({
    where: {
      id,
      invoice: { schoolId: session.user.schoolId! },
    },
    include: {
      invoice: {
        include: {
          student: {
            include: {
              user: { select: { name: true, email: true, phone: true } },
              class: { select: { name: true, section: true } },
            },
          },
          class: { select: { name: true, section: true } },
          payments: { orderBy: { paymentDate: "asc" } },
        },
      },
    },
  });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const school = await db.school.findUnique({
    where: { id: session.user.schoolId! },
    select: { name: true, address: true, phone: true, email: true },
  });

  return NextResponse.json({ ...payment, school });
}
