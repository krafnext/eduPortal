import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const studentId = formData.get("studentId") as string;
  const type = (formData.get("type") as string) || "OTHER";

  if (!file || !studentId) {
    return NextResponse.json({ error: "file and studentId are required" }, { status: 400 });
  }

  const student = await db.student.findUnique({
    where: { id: studentId },
    include: { user: { include: { school: { select: { slug: true } } } } },
  });

  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const schoolSlug = student.user.school?.slug ?? "default";
  const uploadDir = path.join(process.cwd(), "public", "uploads", schoolSlug, studentId);
  await fs.mkdir(uploadDir, { recursive: true });

  const ext = path.extname(file.name);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(uploadDir, filename), buffer);

  const url = `/uploads/${schoolSlug}/${studentId}/${filename}`;

  const doc = await db.document.create({
    data: {
      studentId,
      type,
      name: file.name,
      url,
      size: file.size,
      mimeType: file.type || undefined,
    },
  });

  return NextResponse.json(doc, { status: 201 });
}
