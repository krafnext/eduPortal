import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const DEFAULT_PARENT_PASSWORD = "Parent@123";

/**
 * Finds or creates a User+Parent account from guardian contact info.
 * Returns the Parent.id to set on Student.parentId.
 *
 * - If a User with the email already exists and is a PARENT, reuses it.
 * - If the email belongs to a non-PARENT user, skips (returns null).
 * - Otherwise creates a new User (role=PARENT) + Parent record.
 */
export async function findOrCreateParentAccount(opts: {
  email: string;
  name: string;
  phone: string;
  schoolId: string;
}): Promise<string | null> {
  const { email, name, phone, schoolId } = opts;

  let user = await db.user.findUnique({ where: { email } });

  if (user) {
    if (user.role !== "PARENT") return null; // email taken by a non-parent account
  } else {
    const hashed = await bcrypt.hash(DEFAULT_PARENT_PASSWORD, 10);
    user = await db.user.create({
      data: { name, email, password: hashed, role: "PARENT", phone, schoolId, isActive: true },
    });
  }

  let parent = await db.parent.findUnique({ where: { userId: user.id } });
  if (!parent) {
    parent = await db.parent.create({ data: { userId: user.id } });
  }

  return parent.id;
}
