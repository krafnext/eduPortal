import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin-guard";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  maxStudents: z.number().int().optional(),
  maxTeachers: z.number().int().optional(),
  features: z.array(z.string()).optional(),
  priceMonthly: z.number().min(0).optional(),
  priceYearly: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const plan = await db.plan.findUnique({ where: { id } });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  return NextResponse.json(plan);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const data = updateSchema.parse(await req.json());
  const plan = await db.plan.update({ where: { id }, data });
  return NextResponse.json(plan);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const schoolsOnPlan = await db.school.count({ where: { planId: id } });
  if (schoolsOnPlan > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${schoolsOnPlan} school(s) use this plan` },
      { status: 409 }
    );
  }

  await db.plan.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
