import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin-guard";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2),
  maxStudents: z.number().int().default(100),
  maxTeachers: z.number().int().default(20),
  features: z.array(z.string()).default([]),
  priceMonthly: z.number().min(0).default(0),
  priceYearly: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
});

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const plans = await db.plan.findMany({
    orderBy: { priceMonthly: "asc" },
    include: { _count: { select: { schools: true } } },
  });
  return NextResponse.json(plans);
}

export async function POST(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const data = createSchema.parse(await req.json());
  const plan = await db.plan.create({ data: { ...data, features: data.features } });
  return NextResponse.json(plan, { status: 201 });
}
