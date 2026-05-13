import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2),
  relation: z.string().default("GUARDIAN"),
  phone: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  occupation: z.string().optional(),
  address: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20"));

  const schoolId = session.user.schoolId;
  if (!schoolId) return NextResponse.json({ guardians: [], total: 0 });

  const where = {
    schoolId,
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { phone: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : {}),
  };

  const [guardians, total] = await Promise.all([
    db.guardian.findMany({
      where,
      include: {
        _count: { select: { studentLinks: true } },
        studentLinks: {
          include: {
            student: {
              include: { user: { select: { name: true } }, class: { select: { name: true, section: true } } },
            },
          },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: "asc" },
    }),
    db.guardian.count({ where }),
  ]);

  return NextResponse.json({ guardians, total, page, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.schoolId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, ...rest } = parsed.data;
  const guardian = await db.guardian.create({
    data: {
      ...rest,
      email: email || undefined,
      schoolId: session.user.schoolId,
    },
  });

  return NextResponse.json(guardian, { status: 201 });
}
