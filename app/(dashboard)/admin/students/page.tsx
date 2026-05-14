"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Plus, Upload, ChevronLeft, ChevronRight, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface Student {
  id: string;
  studentId: string;
  classId: string;
  rollNumber: string | null;
  gender: string | null;
  bloodGroup: string | null;
  user: { name: string; email: string; phone: string | null; isActive: boolean };
  class: { id: string; name: string; section: string };
  guardians: Array<{
    id: string;
    isPrimary: boolean;
    guardian: { id: string; name: string; relation: string; phone: string };
  }>;
}

interface ClassOption {
  id: string;
  name: string;
  section: string;
}

const PAGE_SIZE = 20;

export default function StudentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ created: number; skipped: number } | null>(null);

  const search = searchParams.get("search") ?? "";
  const classId = searchParams.get("classId") ?? "";
  const status = searchParams.get("status") ?? "";
  const page = Number(searchParams.get("page") ?? "1");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParam("search", val), 300);
  }

  function setPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`?${params.toString()}`);
  }

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (classId) params.set("classId", classId);
    if (status) params.set("status", status);
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    const res = await fetch(`/api/students?${params}`);
    const data = await res.json();
    setStudents(data.students ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [search, classId, status, page]);

  async function handleMigrateParents() {
    setMigrating(true);
    setMigrateResult(null);
    const res = await fetch("/api/admin/migrate-parents", { method: "POST" });
    const data = await res.json();
    setMigrateResult(data);
    setMigrating(false);
  }

  useEffect(() => {
    fetch("/api/classes")
      .then((r) => r.json())
      .then((data) => setClasses(Array.isArray(data) ? data : data.classes ?? []));
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const primaryGuardian = (s: Student) =>
    s.guardians?.find((g) => g.isPrimary)?.guardian ?? s.guardians?.[0]?.guardian;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
          <p className="text-sm text-muted-foreground">{total} students enrolled</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button type="button" variant="outline" onClick={handleMigrateParents} disabled={migrating}>
            {migrating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
            {migrating ? "Creating parent logins…" : "Create Parent Logins"}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/admissions/import">
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/admissions/new">
              <Plus className="mr-2 h-4 w-4" />
              New Admission
            </Link>
          </Button>
        </div>
      </div>

      {migrateResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center justify-between">
          <span>
            Parent logins created: <strong>{migrateResult.created}</strong> &nbsp;·&nbsp;
            Skipped (no email): <strong>{migrateResult.skipped}</strong>
          </span>
          <button onClick={() => setMigrateResult(null)} className="text-green-600 hover:text-green-800 font-medium text-xs">Dismiss</button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or ID..."
                defaultValue={search}
                onChange={handleSearchChange}
                className="pl-9"
              />
            </div>
            <Select value={classId || "__all__"} onValueChange={(v) => updateParam("classId", v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status || "__all__"} onValueChange={(v) => updateParam("status", v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Guardian</TableHead>
                <TableHead>Blood Group</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && students.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    No students found.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                students.map((s, i) => {
                  const guardian = primaryGuardian(s);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-muted-foreground text-xs">
                        {(page - 1) * PAGE_SIZE + i + 1}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{s.user.name}</p>
                          <p className="text-xs text-muted-foreground">{s.user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {s.class.name} {s.class.section}
                        </span>
                      </TableCell>
                      <TableCell>
                        {guardian ? (
                          <div>
                            <p className="text-sm">{guardian.name}</p>
                            <p className="text-xs text-muted-foreground">{guardian.phone}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.bloodGroup ? (
                          <Badge variant="outline">{s.bloodGroup}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.user.isActive ? "success" : "destructive"}>
                          {s.user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/admin/students/${s.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          {!loading && total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
