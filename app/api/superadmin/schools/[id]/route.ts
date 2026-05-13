import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin-guard";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const school = await db.school.findUnique({
    where: { id },
    include: { plan: true, _count: { select: { users: true } } },
  });
  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 });

  return NextResponse.json(school);
}

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  principalName: z.string().optional(),
  planId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const data = updateSchema.parse(body);

  const school = await db.school.update({ where: { id }, data });
  return NextResponse.json(school);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  await db.school.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
