import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin-guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalSchools,
    activeSchools,
    trialSchools,
    suspendedSchools,
    totalStudents,
    totalTeachers,
    errors24h,
    recentErrors,
    schoolsLast30d,
    avgResponseTime,
  ] = await Promise.all([
    db.school.count(),
    db.school.count({ where: { status: "ACTIVE" } }),
    db.school.count({ where: { status: "TRIAL" } }),
    db.school.count({ where: { status: "SUSPENDED" } }),
    db.user.count({ where: { role: "STUDENT" } }),
    db.user.count({ where: { role: "TEACHER" } }),
    db.appLog.count({ where: { level: "error", createdAt: { gte: since24h } } }),
    db.appLog.findMany({
      where: { level: "error" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, message: true, path: true, createdAt: true },
    }),
    db.school.findMany({
      where: { createdAt: { gte: since30d } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.appLog.aggregate({
      where: { duration: { not: null }, createdAt: { gte: since24h } },
      _avg: { duration: true },
      _count: { duration: true },
    }),
  ]);

  // Monthly school registrations for chart (last 6 months)
  const monthMap = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, 0);
  }
  const allRecentSchools = await db.school.findMany({
    where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
    select: { createdAt: true },
  });
  for (const s of allRecentSchools) {
    const key = `${s.createdAt.getFullYear()}-${String(s.createdAt.getMonth() + 1).padStart(2, "0")}`;
    if (monthMap.has(key)) monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  }
  const schoolChart = Array.from(monthMap.entries()).map(([k, count]) => {
    const [y, m] = k.split("-");
    const label = new Date(parseInt(y), parseInt(m) - 1).toLocaleString("default", { month: "short", year: "2-digit" });
    return { month: label, schools: count };
  });

  // Status breakdown for pie chart
  const statusChart = [
    { status: "Active", count: activeSchools, color: "#22c55e" },
    { status: "Trial", count: trialSchools, color: "#3b82f6" },
    { status: "Suspended", count: suspendedSchools, color: "#ef4444" },
    { status: "Other", count: totalSchools - activeSchools - trialSchools - suspendedSchools, color: "#94a3b8" },
  ].filter((s) => s.count > 0);

  return NextResponse.json({
    counts: { totalSchools, activeSchools, trialSchools, suspendedSchools, totalStudents, totalTeachers },
    errors24h,
    avgResponseMs: Math.round(avgResponseTime._avg.duration ?? 0),
    totalApiCalls24h: avgResponseTime._count.duration,
    recentErrors,
    schoolChart,
    statusChart,
  });
}
