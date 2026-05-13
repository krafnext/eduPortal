import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // "books" | "issues" | "categories"
  const search = searchParams.get("search") ?? "";

  if (type === "categories") {
    return NextResponse.json(await db.bookCategory.findMany({ orderBy: { name: "asc" } }));
  }

  if (type === "issues") {
    const studentId = searchParams.get("studentId") ?? undefined;
    const issues = await db.bookIssue.findMany({
      where: studentId ? { studentId } : {},
      include: { book: { include: { category: true } }, student: { include: { user: { select: { name: true } } } } },
      orderBy: { issueDate: "desc" },
      take: 100,
    });
    return NextResponse.json(issues);
  }

  const books = await db.book.findMany({
    where: search ? { OR: [{ title: { contains: search } }, { author: { contains: search } }, { isbn: { contains: search } }] } : {},
    include: { category: true, _count: { select: { issues: true } } },
    orderBy: { title: "asc" },
  });

  return NextResponse.json(books);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "ADMIN", "STAFF"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  if (action === "add_book") {
    const { title, author, isbn, categoryId, quantity, publishYear, publisher, location } = body;
    const book = await db.book.create({ data: { title, author, isbn, categoryId, quantity, available: quantity, publishYear, publisher, location } });
    return NextResponse.json(book, { status: 201 });
  }

  if (action === "issue_book") {
    const { bookId, studentId, dueDate } = body;
    const book = await db.book.findUnique({ where: { id: bookId } });
    if (!book || book.available < 1) return NextResponse.json({ error: "Book not available" }, { status: 400 });

    const [issue] = await Promise.all([
      db.bookIssue.create({ data: { bookId, studentId, dueDate: new Date(dueDate), status: "ISSUED" } }),
      db.book.update({ where: { id: bookId }, data: { available: { decrement: 1 } } }),
    ]);
    return NextResponse.json(issue, { status: 201 });
  }

  if (action === "return_book") {
    const { issueId } = body;
    const issue = await db.bookIssue.findUnique({ where: { id: issueId } });
    if (!issue) return NextResponse.json({ error: "Issue record not found" }, { status: 404 });

    const returnDate = new Date();
    const dueDate = new Date(issue.dueDate);
    const overdueDays = Math.max(0, Math.floor((returnDate.getTime() - dueDate.getTime()) / 86400000));
    const fine = overdueDays * 1; // $1/day

    const [updated] = await Promise.all([
      db.bookIssue.update({ where: { id: issueId }, data: { returnDate, status: "RETURNED", fine } }),
      db.book.update({ where: { id: issue.bookId }, data: { available: { increment: 1 } } }),
    ]);
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
