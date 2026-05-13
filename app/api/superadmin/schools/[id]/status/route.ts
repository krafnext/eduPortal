import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin-guard";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["suspend", "activate"]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const { action } = schema.parse(await req.json());
  const status = action === "suspend" ? "SUSPENDED" : "ACTIVE";

  const school = await db.school.update({
    where: { id },
    data: { status },
  });

  await db.auditLog.create({
    data: {
      actorId: "system",
      actorType: "superadmin",
      action: action === "suspend" ? "SCHOOL_SUSPENDED" : "SCHOOL_ACTIVATED",
      entityType: "School",
      entityId: id,
      meta: { schoolName: school.name, newStatus: status },
    },
  });

  return NextResponse.json({ success: true, status });
}
