import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/utils";
import { db } from "@/lib/db";
import StudentDocuments from "./StudentDocuments";
import EnrollmentForm from "./EnrollmentForm";
import StudentFeeLedger from "./StudentFeeLedger";

async function getStudent(id: string) {
  return db.student.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true, phone: true, address: true, isActive: true } },
      class: true,
      parent: { include: { user: { select: { name: true, email: true } } } },
      guardians: {
        include: { guardian: true },
        orderBy: { isPrimary: "desc" },
      },
      documents: { orderBy: { createdAt: "desc" } },
      enrollments: { include: { class: true }, orderBy: { createdAt: "desc" } },
    },
  });
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center">
      <span className="w-40 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value ?? "—"}</span>
    </div>
  );
}

function relationVariant(relation: string): "info" | "warning" | "secondary" {
  if (relation === "FATHER") return "info";
  if (relation === "MOTHER") return "warning";
  return "secondary";
}

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/students">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold">{student.user.name}</h1>
              <Badge variant="outline" className="font-mono text-xs">
                {student.studentId}
              </Badge>
              <Badge variant={student.user.isActive ? "success" : "destructive"}>
                {student.user.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {student.class.name} {student.class.section}
              {student.rollNumber ? ` • Roll No. ${student.rollNumber}` : ""}
            </p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/admin/students/${student.id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                <InfoRow label="Full Name" value={student.user.name} />
                <InfoRow label="Email" value={student.user.email} />
                <InfoRow label="Phone" value={student.user.phone} />
                <InfoRow
                  label="Date of Birth"
                  value={student.dateOfBirth ? formatDate(student.dateOfBirth) : null}
                />
                <InfoRow label="Gender" value={student.gender} />
                <InfoRow label="Blood Group" value={student.bloodGroup} />
                <InfoRow label="Religion" value={student.religion} />
                <InfoRow label="Nationality" value={student.nationality} />
                <InfoRow label="Address" value={student.user.address} />
                <InfoRow
                  label="Admission Date"
                  value={student.admissionDate ? formatDate(student.admissionDate) : null}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Guardians</CardTitle>
            </CardHeader>
            <CardContent>
              {student.guardians.length === 0 ? (
                <p className="text-sm text-muted-foreground">No guardians linked.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {student.guardians.map((g) => (
                    <div key={g.id} className="rounded-lg border border-border p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{g.guardian.name}</p>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={relationVariant(g.guardian.relation)}>
                            {g.guardian.relation}
                          </Badge>
                          {g.isPrimary && (
                            <Badge variant="outline" className="text-xs">Primary</Badge>
                          )}
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-1 text-sm">
                        <p>
                          <span className="text-muted-foreground">Phone: </span>
                          {g.guardian.phone}
                        </p>
                        {g.guardian.email && (
                          <p>
                            <span className="text-muted-foreground">Email: </span>
                            {g.guardian.email}
                          </p>
                        )}
                        {g.guardian.occupation && (
                          <p>
                            <span className="text-muted-foreground">Occupation: </span>
                            {g.guardian.occupation}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Parent Login</CardTitle>
            </CardHeader>
            <CardContent>
              {student.parent ? (
                <div className="space-y-2 text-sm">
                  <div className="flex flex-col gap-0.5 py-1 sm:flex-row sm:items-center">
                    <span className="w-40 shrink-0 text-muted-foreground">Login Email</span>
                    <span className="font-medium font-mono">{student.parent.user.email}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 py-1 sm:flex-row sm:items-center">
                    <span className="w-40 shrink-0 text-muted-foreground">Default Password</span>
                    <span className="font-medium font-mono">Parent@123</span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    Parent can log in at the school portal using the email above. Share the default password with the parent — they should change it after first login.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No parent login account yet. Add a guardian with an email address, then use <strong>Create Parent Logins</strong> from the Students list.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Previous Education</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                <InfoRow label="Previous School" value={student.previousSchool} />
                <InfoRow label="Previous Grade" value={student.previousGrade} />
                <InfoRow label="TC Number" value={student.tcNumber} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <StudentDocuments studentId={student.id} initialDocs={student.documents} />
        </TabsContent>

        <TabsContent value="enrollments" className="mt-4">
          <EnrollmentForm studentId={student.id} enrollments={student.enrollments} />
        </TabsContent>

        <TabsContent value="fees" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <StudentFeeLedger studentId={student.id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
