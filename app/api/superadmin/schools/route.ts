import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin-guard";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(["TRIAL", "ACTIVE", "SUSPENDED", "INACTIVE", ""]).optional(),
  search: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const { page, pageSize, status, search } = querySchema.parse(params);
  const skip = (page - 1) * pageSize;

  const where = {
    ...(status ? { status: status as "TRIAL" | "ACTIVE" | "SUSPENDED" | "INACTIVE" } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { slug: { contains: search } },
            { domain: { contains: search } },
          ],
        }
      : {}),
  };

  const [schools, total] = await Promise.all([
    db.school.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: { plan: { select: { name: true } }, _count: { select: { users: true } } },
    }),
    db.school.count({ where }),
  ]);

  return NextResponse.json({ schools, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}
