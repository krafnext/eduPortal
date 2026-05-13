import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin-guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { searchParams } = req.nextUrl;
  const level = searchParams.get("level") ?? undefined;
  const fromDate = searchParams.get("fromDate");
  const toDate = searchParams.get("toDate");
  const path = searchParams.get("path") ?? undefined;
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const skip = (page - 1) * limit;

  const conditions: object[] = [];
  if (level) conditions.push({ level });
  if (fromDate) conditions.push({ createdAt: { gte: new Date(fromDate) } });
  if (toDate) conditions.push({ createdAt: { lte: new Date(toDate) } });
  if (path) conditions.push({ path: { contains: path } });

  const where = conditions.length > 0 ? { AND: conditions } : {};

  const [logs, total] = await Promise.all([
    db.appLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    db.appLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, page, limit, pages: Math.ceil(total / limit) });
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { searchParams } = req.nextUrl;
  const olderThanDays = parseInt(searchParams.get("olderThanDays") ?? "30");
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const { count } = await db.appLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return NextResponse.json({ deleted: count });
}
