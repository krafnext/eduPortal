import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin-guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const [totalSchools, activeSchools, suspendedSchools, trialSchools, recentOnboardings] =
    await Promise.all([
      db.school.count(),
      db.school.count({ where: { status: "ACTIVE" } }),
      db.school.count({ where: { status: "SUSPENDED" } }),
      db.school.count({ where: { status: "TRIAL" } }),
      db.school.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { plan: { select: { name: true } } },
      }),
    ]);

  return NextResponse.json({
    totalSchools,
    activeSchools,
    suspendedSchools,
    trialSchools,
    recentOnboardings,
  });
}
