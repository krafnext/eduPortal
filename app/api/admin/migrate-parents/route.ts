import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { findOrCreateParentAccount } from "@/lib/parent-account";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const students = await db.student.findMany({
    where: {
      parentId: null,
      ...(session.user.schoolId ? { user: { schoolId: session.user.schoolId } } : {}),
    },
    include: {
      user: { select: { schoolId: true } },
      guardians: {
        include: { guardian: true },
        orderBy: { isPrimary: "desc" },
      },
    },
  });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const student of students) {
    const guardianLink = student.guardians.find((g) => g.guardian.email);
    if (!guardianLink) {
      skipped++;
      continue;
    }

    const { guardian } = guardianLink;
    const schoolId = student.user.schoolId;
    if (!schoolId) { skipped++; continue; }

    try {
      const parentId = await findOrCreateParentAccount({
        email: guardian.email!,
        name: guardian.name,
        phone: guardian.phone,
        schoolId,
      });

      if (parentId) {
        await db.student.update({ where: { id: student.id }, data: { parentId } });
        created++;
      } else {
        skipped++;
        errors.push(`${student.user.schoolId} — email ${guardian.email} belongs to a non-parent account`);
      }
    } catch (e) {
      skipped++;
      errors.push(String(e));
    }
  }

  return NextResponse.json({ created, skipped, errors });
}
