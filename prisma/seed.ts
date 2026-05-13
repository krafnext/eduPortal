import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const AY = "2025-2026";

const rng = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const chance = (pct: number) => Math.random() < pct;

function workingDays(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

async function main() {
  // ── idempotency guard ────────────────────────────────────────────────────
  const [feeCount, resultCount] = await Promise.all([prisma.feeStructure.count(), prisma.examResult.count()]);
  if (feeCount >= 24 && resultCount >= 1000) {
    console.log("✅ Full seed already present — skipping.");
    return;
  }

  console.log("🌱  Seeding Green Valley School demo data…");
  const pw = await bcrypt.hash("password123", 10);

  // ════════════════════════════════════════════════════════════════
  // 1. PLANS
  // ════════════════════════════════════════════════════════════════
  await prisma.plan.upsert({ where: { name: "Free" }, update: {}, create: { name: "Free", maxStudents: 50, maxTeachers: 5, features: [], priceMonthly: 0, priceYearly: 0 } });
  await prisma.plan.upsert({ where: { name: "Basic" }, update: {}, create: { name: "Basic", maxStudents: 300, maxTeachers: 30, features: ["Attendance", "Fees", "Exams", "Reports"], priceMonthly: 999, priceYearly: 9990 } });
  const proPlan = await prisma.plan.upsert({ where: { name: "Pro" }, update: {}, create: { name: "Pro", maxStudents: 2000, maxTeachers: 200, features: ["Attendance", "Fees", "Exams", "Reports", "Library", "Timetable", "SMS Alerts"], priceMonthly: 2499, priceYearly: 24990 } });

  // ════════════════════════════════════════════════════════════════
  // 2. SUPER ADMIN
  // ════════════════════════════════════════════════════════════════
  await prisma.superAdmin.upsert({
    where: { email: "superadmin@eduportal.com" },
    update: {},
    create: { email: "superadmin@eduportal.com", passwordHash: await bcrypt.hash("superadmin123", 10), name: "Super Admin" },
  });

  // ════════════════════════════════════════════════════════════════
  // 3. SCHOOL
  // ════════════════════════════════════════════════════════════════
  const school = await prisma.school.upsert({
    where: { slug: "green-valley-school" },
    update: { name: "Green Valley Senior Secondary School", status: "ACTIVE", planId: proPlan.id },
    create: {
      name: "Green Valley Senior Secondary School",
      slug: "green-valley-school",
      domain: "gvss.edu.in",
      status: "ACTIVE",
      planId: proPlan.id,
      isVerified: true,
      principalName: "Dr. Ramesh Chandra",
      phone: "+91-9876543210",
      email: "principal@gvss.edu.in",
      address: "12 Education Road, Sector 5, New Delhi – 110001",
      subscriptionStatus: "ACTIVE",
      subscriptionStart: new Date("2025-04-01"),
      subscriptionEnd: new Date("2026-03-31"),
    },
  });

  await prisma.academicYear.upsert({
    where: { name_schoolId: { name: AY, schoolId: school.id } },
    update: {},
    create: { name: AY, startDate: new Date("2025-04-01"), endDate: new Date("2026-03-31"), isCurrent: true, schoolId: school.id },
  });

  // ════════════════════════════════════════════════════════════════
  // 4. SCHOOL ADMIN
  // ════════════════════════════════════════════════════════════════
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@gvss.edu.in" },
    update: {},
    create: { name: "Rajiv Sharma", email: "admin@gvss.edu.in", password: pw, role: UserRole.SCHOOL_ADMIN, phone: "+91-9812345678", schoolId: school.id },
  });

  // ════════════════════════════════════════════════════════════════
  // 5. CLASS LEVELS
  // ════════════════════════════════════════════════════════════════
  const levelNames = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10"];
  for (let i = 0; i < levelNames.length; i++) {
    await prisma.classLevel.upsert({
      where: { name_schoolId: { name: levelNames[i], schoolId: school.id } },
      update: {},
      create: { name: levelNames[i], order: i + 1, schoolId: school.id },
    });
  }

  // ════════════════════════════════════════════════════════════════
  // 6. CLASSES  (6-A, 6-B, 7-A, 8-A, 9-A, 10-A)
  // ════════════════════════════════════════════════════════════════
  const classDefs = [
    { name: "Class 6", section: "A" },
    { name: "Class 6", section: "B" },
    { name: "Class 7", section: "A" },
    { name: "Class 8", section: "A" },
    { name: "Class 9", section: "A" },
    { name: "Class 10", section: "A" },
  ];
  const classMap: Record<string, { id: string; name: string; section: string }> = {};
  for (const cd of classDefs) {
    const cl = await prisma.class.upsert({
      where: { name_section_academicYear: { name: cd.name, section: cd.section, academicYear: AY } },
      update: {},
      create: { name: cd.name, section: cd.section, capacity: 40, academicYear: AY },
    });
    classMap[`${cd.name}-${cd.section}`] = cl;
  }

  // ════════════════════════════════════════════════════════════════
  // 7. SUBJECTS
  // ════════════════════════════════════════════════════════════════
  const subjectDefs = [
    { name: "Mathematics",       code: "MATH101",  type: "THEORY" },
    { name: "English",           code: "ENG101",   type: "THEORY" },
    { name: "Science",           code: "SCI101",   type: "THEORY" },
    { name: "Hindi",             code: "HINDI101", type: "THEORY" },
    { name: "Social Studies",    code: "SST101",   type: "THEORY" },
    { name: "Computer Science",  code: "CS101",    type: "THEORY" },
    { name: "Physics",           code: "PHY101",   type: "THEORY" },
    { name: "Chemistry",         code: "CHEM101",  type: "THEORY" },
    { name: "Biology",           code: "BIO101",   type: "THEORY" },
    { name: "History",           code: "HIST101",  type: "THEORY" },
    { name: "Geography",         code: "GEO101",   type: "THEORY" },
    { name: "Physical Education",code: "PE101",    type: "THEORY" },
  ];
  const subjectMap: Record<string, { id: string }> = {};
  for (const sd of subjectDefs) {
    const s = await prisma.subject.upsert({ where: { code: sd.code }, update: {}, create: { name: sd.name, code: sd.code, type: sd.type } });
    subjectMap[sd.code] = s;
  }

  // ════════════════════════════════════════════════════════════════
  // 8. TEACHERS  (20)
  // ════════════════════════════════════════════════════════════════
  const teacherDefs = [
    { name: "Rahul Sharma",    email: "rahul.sharma@gvss.edu.in",    dept: "Mathematics",        qual: "M.Sc. Mathematics",   empId: "EMP001" },
    { name: "Priya Patel",     email: "priya.patel@gvss.edu.in",     dept: "Science",            qual: "M.Sc. Physics",       empId: "EMP002" },
    { name: "Amit Kumar",      email: "amit.kumar@gvss.edu.in",      dept: "Science",            qual: "M.Sc. Chemistry",     empId: "EMP003" },
    { name: "Sunita Verma",    email: "sunita.verma@gvss.edu.in",    dept: "Languages",          qual: "M.A. English",        empId: "EMP004" },
    { name: "Rajesh Gupta",    email: "rajesh.gupta@gvss.edu.in",    dept: "Computer Science",   qual: "M.Tech CSE",          empId: "EMP005" },
    { name: "Kavya Reddy",     email: "kavya.reddy@gvss.edu.in",     dept: "Science",            qual: "M.Sc. Biology",       empId: "EMP006" },
    { name: "Mohit Singh",     email: "mohit.singh@gvss.edu.in",     dept: "Social Studies",     qual: "M.A. History",        empId: "EMP007" },
    { name: "Neha Joshi",      email: "neha.joshi@gvss.edu.in",      dept: "Social Studies",     qual: "M.A. Geography",      empId: "EMP008" },
    { name: "Suresh Rao",      email: "suresh.rao@gvss.edu.in",      dept: "Languages",          qual: "M.A. Hindi",          empId: "EMP009" },
    { name: "Arjun Nair",      email: "arjun.nair@gvss.edu.in",      dept: "Physical Education", qual: "B.P.Ed",              empId: "EMP010" },
    { name: "Deepa Menon",     email: "deepa.menon@gvss.edu.in",     dept: "Mathematics",        qual: "M.Sc. Mathematics",   empId: "EMP011" },
    { name: "Vikram Bose",     email: "vikram.bose@gvss.edu.in",     dept: "Science",            qual: "M.Sc. Physics",       empId: "EMP012" },
    { name: "Sanjay Desai",    email: "sanjay.desai@gvss.edu.in",    dept: "Social Studies",     qual: "M.A. Political Sci.", empId: "EMP013" },
    { name: "Rekha Pillai",    email: "rekha.pillai@gvss.edu.in",    dept: "Languages",          qual: "M.A. English",        empId: "EMP014" },
    { name: "Anil Tiwari",     email: "anil.tiwari@gvss.edu.in",     dept: "Science",            qual: "M.Sc. Chemistry",     empId: "EMP015" },
    { name: "Pooja Chauhan",   email: "pooja.chauhan@gvss.edu.in",   dept: "Languages",          qual: "M.A. Hindi",          empId: "EMP016" },
    { name: "Ravi Mishra",     email: "ravi.mishra@gvss.edu.in",     dept: "Science",            qual: "M.Sc. Physics",       empId: "EMP017" },
    { name: "Anita Banerjee",  email: "anita.banerjee@gvss.edu.in",  dept: "Science",            qual: "M.Sc. Chemistry",     empId: "EMP018" },
    { name: "Kiran Kumar",     email: "kiran.kumar@gvss.edu.in",     dept: "Mathematics",        qual: "Ph.D. Mathematics",   empId: "EMP019" },
    { name: "Meena Iyer",      email: "meena.iyer@gvss.edu.in",      dept: "Social Studies",     qual: "M.A. Social Studies", empId: "EMP020" },
  ];
  const teachers: { id: string; userId: string }[] = [];
  for (const td of teacherDefs) {
    const u = await prisma.user.upsert({
      where: { email: td.email },
      update: {},
      create: { name: td.name, email: td.email, password: pw, role: UserRole.TEACHER, phone: `+91-${rng(7000000000, 9999999999)}`, schoolId: school.id },
    });
    const t = await prisma.teacher.upsert({
      where: { employeeId: td.empId },
      update: { userId: u.id, department: td.dept, qualification: td.qual },
      create: { userId: u.id, employeeId: td.empId, department: td.dept, qualification: td.qual },
    });
    teachers.push(t);
  }

  // subject → primary teacher index
  const subjectTeacherIdx: Record<string, number> = {
    MATH101: 0, PHY101: 1, CHEM101: 2, ENG101: 3, CS101: 4, BIO101: 5,
    HIST101: 6, GEO101: 7, HINDI101: 8, PE101: 9, SCI101: 1, SST101: 12,
  };
  for (const [code, idx] of Object.entries(subjectTeacherIdx)) {
    if (subjectMap[code]) {
      await prisma.subject.update({ where: { code }, data: { teacherId: teachers[idx].id } });
    }
  }

  // class → subject codes
  const lowerSubjects = ["MATH101", "ENG101", "SCI101", "HINDI101", "SST101", "CS101", "PE101"];
  const upperSubjects = ["MATH101", "ENG101", "PHY101", "CHEM101", "BIO101", "HIST101", "GEO101", "HINDI101", "CS101", "PE101"];
  const classSubjectCodes: Record<string, string[]> = {
    "Class 6-A": lowerSubjects, "Class 6-B": lowerSubjects,
    "Class 7-A": lowerSubjects, "Class 8-A": lowerSubjects,
    "Class 9-A": upperSubjects, "Class 10-A": upperSubjects,
  };

  // class → subject → teacher index
  const classTeacherIdx: Record<string, Record<string, number>> = {
    "Class 6-A":  { MATH101:0,  ENG101:3,  SCI101:1,  HINDI101:8,  SST101:12, CS101:4,  PE101:9  },
    "Class 6-B":  { MATH101:10, ENG101:13, SCI101:11, HINDI101:15, SST101:19, CS101:4,  PE101:9  },
    "Class 7-A":  { MATH101:0,  ENG101:3,  SCI101:11, HINDI101:8,  SST101:6,  CS101:4,  PE101:9  },
    "Class 8-A":  { MATH101:10, ENG101:13, SCI101:2,  HINDI101:15, SST101:7,  CS101:4,  PE101:9  },
    "Class 9-A":  { MATH101:18, ENG101:3,  PHY101:1,  CHEM101:2,   BIO101:5,  HIST101:6, GEO101:7, HINDI101:8,  CS101:4, PE101:9 },
    "Class 10-A": { MATH101:18, ENG101:13, PHY101:16, CHEM101:14,  BIO101:5,  HIST101:6, GEO101:7, HINDI101:15, CS101:4, PE101:9 },
  };

  for (const [ck, codes] of Object.entries(classSubjectCodes)) {
    const cls = classMap[ck];
    if (!cls) continue;
    for (const code of codes) {
      const subj = subjectMap[code];
      if (!subj) continue;
      await prisma.classSubject.upsert({
        where: { classId_subjectId: { classId: cls.id, subjectId: subj.id } },
        update: {},
        create: { classId: cls.id, subjectId: subj.id },
      });
      const tIdx = classTeacherIdx[ck]?.[code] ?? 0;
      await prisma.teacherAssignment.upsert({
        where: { classId_subjectId_academicYear: { classId: cls.id, subjectId: subj.id, academicYear: AY } },
        update: {},
        create: { teacherId: teachers[tIdx].id, classId: cls.id, subjectId: subj.id, academicYear: AY },
      });
    }
  }

  // ── Timetable ────────────────────────────────────────────────────────────
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const TIMES = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00"];
  for (const [ck, codes] of Object.entries(classSubjectCodes)) {
    const cls = classMap[ck];
    if (!cls) continue;
    for (const day of DAYS) {
      for (let p = 0; p < Math.min(codes.length, 7); p++) {
        const code = codes[p];
        const subj = subjectMap[code];
        const tIdx = classTeacherIdx[ck]?.[code] ?? 0;
        const teacher = teachers[tIdx];
        if (!subj || !teacher) continue;
        await prisma.timetable.upsert({
          where: { classId_day_period: { classId: cls.id, day, period: p + 1 } },
          update: {},
          create: { classId: cls.id, subjectId: subj.id, teacherId: teacher.id, day, period: p + 1, startTime: TIMES[p], endTime: TIMES[p + 1] ?? "15:00" },
        });
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 9. STUDENTS  (30 per class = 180 total)
  // ════════════════════════════════════════════════════════════════
  const maleFirst   = ["Aarav","Rohan","Arjun","Vivaan","Aditya","Siddharth","Karan","Dev","Nikhil","Raj","Pranav","Aryan","Kabir","Ishaan","Rishi","Varun","Tarun","Dhruv","Yash","Parth","Ansh","Veer","Neel","Kunal","Surya","Mihir","Abhay","Vinay","Sujit","Nakul"];
  const femaleFirst = ["Aanya","Priya","Divya","Riya","Ananya","Shruti","Kavya","Meera","Tara","Pooja","Naina","Sakshi","Aditi","Neha","Ishita","Simran","Prachi","Swati","Monika","Sneha","Diya","Ruchi","Kritika","Sonia","Asha","Puja","Tanvi","Smita","Nisha","Deepa"];
  const lastNames   = ["Kumar","Sharma","Singh","Verma","Gupta","Patel","Reddy","Joshi","Nair","Rao","Bose","Iyer","Menon","Desai","Pillai","Tiwari","Chauhan","Mishra","Banerjee","Sinha","Yadav","Pandey","Malhotra","Kapoor","Mehta","Shah","Agarwal","Jain","Dubey","Saxena"];
  const bloodGroups = ["A+","A-","B+","B-","O+","O-","AB+","AB-"];
  const religions   = ["Hindu","Muslim","Christian","Sikh","Buddhist","Jain"];
  const addresses   = ["MG Road","Gandhi Nagar","Nehru Street","Patel Colony","Lal Bagh","Civil Lines","Rajouri Garden","Karol Bagh","Connaught Place","Dwarka"];

  const allStudents: { id: string; classId: string; classKey: string; name: string }[] = [];

  const existingStudentCount = await prisma.student.count({ where: { studentId: { startsWith: "STU" } } });
  if (existingStudentCount >= 180) {
    // Load existing students from DB grouped by class
    console.log("  ↩ Students already present — loading from DB…");
    const classKeys = Object.keys(classMap);
    for (const classKey of classKeys) {
      const cls = classMap[classKey];
      const rows = await prisma.student.findMany({
        where: { classId: cls.id },
        include: { user: { select: { name: true } } },
        orderBy: { studentId: "asc" },
      });
      for (const r of rows) {
        allStudents.push({ id: r.id, classId: cls.id, classKey, name: r.user.name });
      }
    }
  } else {
    let stuCounter = 1;
    for (const [classKey, cls] of Object.entries(classMap)) {
      const classNum = parseInt(cls.name.match(/\d+/)?.[0] ?? "10");
      for (let i = 0; i < 30; i++) {
        const isMale = i < 15;
        const firstName = isMale ? maleFirst[i] : femaleFirst[i - 15];
        const lastName = lastNames[(stuCounter - 1) % lastNames.length];
        const fullName = `${firstName} ${lastName}`;
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${stuCounter}@student.gvss.edu.in`;
        const stuId = `STU${String(stuCounter).padStart(4, "0")}`;
        const birthYear = 2025 - (classNum + 5);
        const dob = new Date(birthYear, rng(0, 11), rng(1, 28));

        const u = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            name: fullName, email, password: pw, role: UserRole.STUDENT,
            phone: `+91-${rng(7000000000, 9999999999)}`,
            address: `${rng(1, 999)} ${pick(addresses)}, New Delhi`,
            schoolId: school.id,
          },
        });
        const student = await prisma.student.upsert({
          where: { studentId: stuId },
          update: { userId: u.id, classId: cls.id },
          create: {
            userId: u.id, studentId: stuId, classId: cls.id,
            rollNumber: String(i + 1),
            gender: isMale ? "Male" : "Female",
            bloodGroup: pick(bloodGroups),
            religion: pick(religions),
            nationality: "Indian",
            dateOfBirth: dob,
            admissionDate: new Date("2025-04-01"),
          },
        });
        await prisma.enrollment.upsert({
          where: { studentId_academicYear: { studentId: student.id, academicYear: AY } },
          update: {},
          create: { studentId: student.id, classId: cls.id, academicYear: AY, rollNumber: String(i + 1), status: "ACTIVE" },
        });
        allStudents.push({ id: student.id, classId: cls.id, classKey, name: fullName });
        stuCounter++;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 10. GUARDIANS + PARENT ACCOUNTS
  // ════════════════════════════════════════════════════════════════
  const occupations = ["Engineer","Doctor","Teacher","Businessman","Govt. Employee","Farmer","Lawyer","Banker","Architect","Professor"];
  const existingGuardianCount = await prisma.guardian.count();
  if (existingGuardianCount < allStudents.length * 2) {
    for (let i = 0; i < allStudents.length; i++) {
      const s = allStudents[i];
      const ln = s.name.split(" ").slice(1).join(" ");
      const fatherEmail = `ramesh.${ln.toLowerCase().replace(/ /g,"")}.${i}@gmail.com`;
      const motherEmail = `sunita.${ln.toLowerCase().replace(/ /g,"")}.${i}@gmail.com`;
      const existingF = await prisma.guardian.findFirst({ where: { email: fatherEmail } });
      const father = existingF ?? await prisma.guardian.create({
        data: { name: `Mr. Ramesh ${ln}`, relation: "FATHER", phone: `+91-${rng(7000000000,9999999999)}`, email: fatherEmail, occupation: pick(occupations), schoolId: school.id },
      });
      const existingM = await prisma.guardian.findFirst({ where: { email: motherEmail } });
      const mother = existingM ?? await prisma.guardian.create({
        data: { name: `Mrs. Sunita ${ln}`, relation: "MOTHER", phone: `+91-${rng(7000000000,9999999999)}`, email: motherEmail, occupation: pick(occupations), schoolId: school.id },
      });
      await prisma.studentGuardian.createMany({
        data: [
          { studentId: s.id, guardianId: father.id, isPrimary: true },
          { studentId: s.id, guardianId: mother.id, isPrimary: false },
        ],
        skipDuplicates: true,
      });
    }
  }

  // Parent portal accounts (one per 3 students)
  for (let i = 0; i < 30; i++) {
    const s = allStudents[i];
    const email = `parent${i + 1}@gvss.edu.in`;
    const u = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { name: `Parent of ${s.name}`, email, password: pw, role: UserRole.PARENT, phone: `+91-${rng(7000000000,9999999999)}`, schoolId: school.id },
    });
    const parent = await prisma.parent.upsert({ where: { userId: u.id }, update: {}, create: { userId: u.id } });
    await prisma.student.update({ where: { id: s.id }, data: { parentId: parent.id } });
  }

  // ════════════════════════════════════════════════════════════════
  // 11. FEE STRUCTURES + INVOICES + PAYMENTS
  // ════════════════════════════════════════════════════════════════
  const feeTypes = [
    { feeType: "TUITION", name: "Tuition Fee",      amount: 12000 },
    { feeType: "EXAM",    name: "Examination Fee",  amount: 1500  },
    { feeType: "LIBRARY", name: "Library Fee",      amount: 500   },
    { feeType: "OTHER",   name: "Development Fee",  amount: 1000  },
  ];
  const feeStructureMap: Record<string, { id: string }> = {};
  for (const cls of Object.values(classMap)) {
    for (const ft of feeTypes) {
      const fs = await prisma.feeStructure.create({
        data: { name: `${ft.name} – ${cls.name} ${cls.section}`, classId: cls.id, feeType: ft.feeType as never, amount: ft.amount, academicYear: AY, dueDate: new Date("2025-07-31"), frequency: "ANNUAL" },
      });
      feeStructureMap[`${cls.id}-${ft.feeType}`] = fs;
    }
  }

  let invoiceSeq = 1;
  let receiptSeq = 1;
  const totalFee = feeTypes.reduce((s, f) => s + f.amount, 0);

  for (const student of allStudents) {
    const isPaid    = chance(0.60);
    const isPartial = !isPaid && chance(0.25);
    const paidAmt   = isPaid ? totalFee : isPartial ? rng(5000, totalFee - 500) : 0;
    const status    = isPaid ? "PAID" : isPartial ? "PARTIAL" : "PENDING";
    const invoiceNo = `INV${AY.replace("-","")}-${String(invoiceSeq).padStart(4,"0")}`;

    try {
      const inv = await prisma.invoice.create({
        data: {
          invoiceNo, studentId: student.id, classId: student.classId,
          items: feeTypes.map(f => ({ type: f.feeType, name: f.name, amount: f.amount })),
          totalAmount: totalFee, paidAmount: paidAmt,
          dueDate: new Date("2025-07-31"), academicYear: AY,
          period: "Annual", status: status as never, schoolId: school.id,
        },
      });
      if (paidAmt > 0) {
        await prisma.payment.create({
          data: {
            invoiceId: inv.id,
            receiptNumber: `RCP${String(receiptSeq).padStart(5,"0")}`,
            amount: paidAmt,
            paymentMode: pick(["CASH","UPI","BANK_TRANSFER","ONLINE"]) as never,
            paymentDate: new Date(`2025-0${rng(4,7)}-${String(rng(1,25)).padStart(2,"0")}`),
            remarks: "Fee payment received",
          },
        });
        receiptSeq++;
      }
      // Legacy FeePayment record
      const tuitionFs = feeStructureMap[`${student.classId}-TUITION`];
      if (tuitionFs) {
        await prisma.feePayment.create({
          data: {
            studentId: student.id, feeStructureId: tuitionFs.id,
            paidAmount: isPaid ? 12000 : isPartial ? rng(5000,11999) : 0,
            status: status as never,
            paymentMethod: pick(["Cash","UPI","Bank Transfer"]),
            receiptNumber: `FP${String(invoiceSeq).padStart(5,"0")}`,
            paidDate: new Date(`2025-0${rng(4,7)}-${String(rng(1,25)).padStart(2,"0")}`),
          },
        });
      }
      invoiceSeq++;
    } catch { invoiceSeq++; }
  }

  // ════════════════════════════════════════════════════════════════
  // 12. ATTENDANCE  (Aug 1 → Oct 31 2025, ~65 school days)
  // ════════════════════════════════════════════════════════════════
  console.log("  → Attendance…");
  const attDays = workingDays(new Date("2025-08-01"), new Date("2025-10-31"));
  const attRows: { studentId: string; date: Date; status: string; period: number; markedBy: string }[] = [];
  for (const s of allStudents) {
    for (const d of attDays) {
      const r = Math.random();
      const status = r < 0.82 ? "PRESENT" : r < 0.90 ? "ABSENT" : r < 0.96 ? "LATE" : "EXCUSED";
      attRows.push({ studentId: s.id, date: d, status, period: 0, markedBy: adminUser.id });
    }
  }
  for (let i = 0; i < attRows.length; i += 500) {
    await prisma.attendance.createMany({ data: attRows.slice(i, i + 500) as never, skipDuplicates: true });
  }

  // ════════════════════════════════════════════════════════════════
  // 13. EXAMS + PAPERS + MARKS
  // ════════════════════════════════════════════════════════════════
  console.log("  → Exams…");
  const examDefs = [
    { name: "Unit Test 1",              start: "2025-07-10", end: "2025-07-12", status: "PUBLISHED", weightage: 20 },
    { name: "Half Yearly Examination",  start: "2025-09-22", end: "2025-09-30", status: "PUBLISHED", weightage: 40 },
    { name: "Annual Examination",       start: "2026-02-20", end: "2026-03-05", status: "ACTIVE",    weightage: 60 },
  ];
  const exams: { id: string; status: string }[] = [];
  for (const ed of examDefs) {
    const ex = await prisma.exam.create({
      data: {
        name: ed.name, academicYear: AY, startDate: new Date(ed.start), endDate: new Date(ed.end),
        status: ed.status as never, weightage: ed.weightage,
        publishedAt: ed.status === "PUBLISHED" ? new Date(ed.start) : null,
        isPublished: ed.status === "PUBLISHED",
        schoolId: school.id, type: "MIDTERM",
      },
    });
    exams.push(ex);
  }

  // Papers: for each exam × class × subject (excluding PE)
  const papers: { id: string; classId: string; maxMarks: number; passingMarks: number; isDraft: boolean }[] = [];
  for (let eIdx = 0; eIdx < exams.length; eIdx++) {
    const exam = exams[eIdx];
    const isDraft = exam.status !== "PUBLISHED";
    for (const [ck, codes] of Object.entries(classSubjectCodes)) {
      const cls = classMap[ck];
      if (!cls) continue;
      for (const code of codes.filter(c => c !== "PE101")) {
        const subj = subjectMap[code];
        if (!subj) continue;
        const maxMarks = code === "CS101" ? 50 : 100;
        try {
          const p = await prisma.examPaper.upsert({
            where: { examId_subjectId_classId: { examId: exam.id, subjectId: subj.id, classId: cls.id } },
            update: {},
            create: { examId: exam.id, subjectId: subj.id, classId: cls.id, maxMarks, passingMarks: maxMarks * 0.4 },
          });
          papers.push({ id: p.id, classId: cls.id, maxMarks, passingMarks: maxMarks * 0.4, isDraft });
        } catch { /* skip */ }
      }
    }
  }

  console.log("  → Marks…");
  const markRows: { paperId: string; studentId: string; marksObtained: number | null; isAbsent: boolean; isDraft: boolean }[] = [];
  for (const paper of papers) {
    const classStudents = allStudents.filter(s => s.classId === paper.classId);
    for (const s of classStudents) {
      const absent = chance(0.03);
      let marks: number | null = null;
      if (!absent) {
        const r = Math.random();
        if (r < 0.05)      marks = rng(0, Math.floor(paper.passingMarks * 0.9));
        else if (r < 0.20) marks = rng(Math.ceil(paper.passingMarks), Math.floor(paper.maxMarks * 0.59));
        else if (r < 0.65) marks = rng(Math.ceil(paper.maxMarks * 0.60), Math.floor(paper.maxMarks * 0.79));
        else               marks = rng(Math.ceil(paper.maxMarks * 0.80), paper.maxMarks);
      }
      markRows.push({ paperId: paper.id, studentId: s.id, marksObtained: marks, isAbsent: absent, isDraft: paper.isDraft });
    }
  }
  for (let i = 0; i < markRows.length; i += 500) {
    await prisma.mark.createMany({ data: markRows.slice(i, i + 500), skipDuplicates: true });
  }

  // ════════════════════════════════════════════════════════════════
  // 14. ASSIGNMENTS
  // ════════════════════════════════════════════════════════════════
  const assignTitles: Record<string, string[]> = {
    MATH101: ["Algebra Practice Set","Geometry Worksheet","Statistics Project"],
    ENG101:  ["Essay: My Future","Reading Comprehension","Grammar Exercise"],
    SCI101:  ["Lab Report: Photosynthesis","Science Fair Project"],
    HINDI101:["निबंध लेखन","पत्र लेखन"],
    SST101:  ["Map Work Assignment","Current Affairs Report"],
    CS101:   ["HTML Website Design","Python Programming Task"],
    PHY101:  ["Optics Numericals","Electricity Project"],
    CHEM101: ["Periodic Table Quiz","Organic Chemistry Notes"],
    BIO101:  ["Cell Diagram","Ecosystem Report"],
    HIST101: ["Freedom Movement Essay","World War II Summary"],
    GEO101:  ["India Rivers Map","Climate Change Report"],
  };
  for (const [ck, codes] of Object.entries(classSubjectCodes)) {
    const cls = classMap[ck];
    if (!cls) continue;
    for (const code of codes.filter(c => c !== "PE101")) {
      const subj = subjectMap[code];
      const tIdx = classTeacherIdx[ck]?.[code] ?? 0;
      const teacher = teachers[tIdx];
      if (!subj || !teacher) continue;
      const titles = assignTitles[code] ?? ["Assignment"];
      for (let t = 0; t < Math.min(2, titles.length); t++) {
        await prisma.assignment.create({
          data: {
            title: titles[t],
            description: "Complete all questions neatly and submit by the due date.",
            subjectId: subj.id, teacherId: teacher.id, classId: cls.id,
            dueDate: new Date(`2025-${rng(8,11)}-${String(rng(5,25)).padStart(2,"0")}`),
          },
        });
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 15. LIBRARY  (25 books + 40 issues)
  // ════════════════════════════════════════════════════════════════
  const catNames = ["Mathematics","Physics","Chemistry","Biology","English Literature","Hindi","History","Geography","Computer Science","Reference"];
  const catMap: Record<string, { id: string }> = {};
  for (const n of catNames) {
    const c = await prisma.bookCategory.upsert({ where: { name: n }, update: {}, create: { name: n } });
    catMap[n] = c;
  }
  const bookList = [
    { title:"NCERT Mathematics Class 10",          author:"NCERT",           isbn:"ISBN-MATH-10",  cat:"Mathematics",          qty:50 },
    { title:"R.D. Sharma Mathematics Vol 1",        author:"R.D. Sharma",     isbn:"ISBN-MATH-RD",  cat:"Mathematics",          qty:30 },
    { title:"NCERT Physics Part 1 Class 12",        author:"NCERT",           isbn:"ISBN-PHY-12-1", cat:"Physics",              qty:40 },
    { title:"H.C. Verma Concepts of Physics Vol 1", author:"H.C. Verma",      isbn:"ISBN-PHY-HCV1", cat:"Physics",              qty:20 },
    { title:"NCERT Chemistry Part 1 Class 12",      author:"NCERT",           isbn:"ISBN-CHM-12-1", cat:"Chemistry",            qty:40 },
    { title:"NCERT Chemistry Part 2 Class 12",      author:"NCERT",           isbn:"ISBN-CHM-12-2", cat:"Chemistry",            qty:40 },
    { title:"NCERT Biology Class 12",               author:"NCERT",           isbn:"ISBN-BIO-12",   cat:"Biology",              qty:35 },
    { title:"Trueman's Biology Vol 1",              author:"M.P. Tyagi",      isbn:"ISBN-BIO-TR1",  cat:"Biology",              qty:20 },
    { title:"Wren & Martin English Grammar",        author:"Wren & Martin",   isbn:"ISBN-ENG-WM",   cat:"English Literature",   qty:30 },
    { title:"NCERT English Flamingo",               author:"NCERT",           isbn:"ISBN-ENG-FL",   cat:"English Literature",   qty:45 },
    { title:"NCERT Hindi Aroh Class 12",            author:"NCERT",           isbn:"ISBN-HIN-ARH",  cat:"Hindi",                qty:45 },
    { title:"NCERT Hindi Vitan",                    author:"NCERT",           isbn:"ISBN-HIN-VIT",  cat:"Hindi",                qty:45 },
    { title:"NCERT History Class 10",               author:"NCERT",           isbn:"ISBN-HIS-10",   cat:"History",              qty:40 },
    { title:"Ancient India by R.S. Sharma",         author:"R.S. Sharma",     isbn:"ISBN-HIS-RS",   cat:"History",              qty:15 },
    { title:"NCERT Geography Class 10",             author:"NCERT",           isbn:"ISBN-GEO-10",   cat:"Geography",            qty:40 },
    { title:"Oxford School Atlas",                  author:"Oxford",          isbn:"ISBN-GEO-ATL",  cat:"Geography",            qty:25 },
    { title:"Computer Science with Python",         author:"Sumita Arora",    isbn:"ISBN-CS-SA",    cat:"Computer Science",     qty:35 },
    { title:"NCERT Computer Science Class 12",      author:"NCERT",           isbn:"ISBN-CS-NC12",  cat:"Computer Science",     qty:40 },
    { title:"Programming in Python",                author:"E. Balagurusamy", isbn:"ISBN-CS-PY",    cat:"Computer Science",     qty:20 },
    { title:"Encyclopedia Britannica Jr.",          author:"Britannica",      isbn:"ISBN-REF-ENC",  cat:"Reference",            qty:10 },
    { title:"Oxford Dictionary",                    author:"Oxford",          isbn:"ISBN-REF-DIC",  cat:"Reference",            qty:15 },
    { title:"Manorama Year Book 2025",              author:"Manorama",        isbn:"ISBN-REF-MYB",  cat:"Reference",            qty:8  },
    { title:"Wings of Fire",                        author:"A.P.J. Abdul Kalam", isbn:"ISBN-BIO-WOF", cat:"Reference",          qty:12 },
    { title:"The Alchemist",                        author:"Paulo Coelho",    isbn:"ISBN-ENG-ALC",  cat:"English Literature",   qty:10 },
    { title:"Mathematics Olympiad Problems",        author:"S.L. Loney",      isbn:"ISBN-MATH-OLY", cat:"Mathematics",          qty:18 },
  ];
  const books: { id: string }[] = [];
  for (const b of bookList) {
    const book = await prisma.book.upsert({
      where: { isbn: b.isbn },
      update: {},
      create: { title: b.title, author: b.author, isbn: b.isbn, categoryId: catMap[b.cat].id, quantity: b.qty, available: Math.floor(b.qty * 0.7), publishYear: 2024, location: `Shelf ${pick(["A","B","C","D"])}-${rng(1,10)}` },
    });
    books.push(book);
  }
  for (let i = 0; i < 40; i++) {
    const book  = books[i % books.length];
    const student = allStudents[rng(0, allStudents.length - 1)];
    const overdue   = i < 5;
    const returned  = i >= 20 && i < 35;
    await prisma.bookIssue.create({
      data: {
        bookId: book.id, studentId: student.id,
        issueDate: new Date(`2025-0${rng(8,9)}-${String(rng(1,25)).padStart(2,"0")}`),
        dueDate:   overdue ? new Date("2025-09-15") : new Date("2025-12-31"),
        returnDate: returned ? new Date(`2025-${rng(10,11)}-${String(rng(1,25)).padStart(2,"0")}`) : null,
        status: overdue ? "OVERDUE" : returned ? "RETURNED" : "ISSUED",
        fine: overdue ? rng(10, 150) : 0,
      },
    });
  }

  // ════════════════════════════════════════════════════════════════
  // 16. NOTICES
  // ════════════════════════════════════════════════════════════════
  const notices = [
    { title:"Welcome to Academic Year 2025-2026",          content:"Welcome to the new academic year! All students must submit updated contact forms by April 10, 2025.",    role:null        },
    { title:"Half Yearly Exam Schedule Released",          content:"Half Yearly Examinations begin September 22, 2025. Detailed schedule is on the notice board and portal.", role:"STUDENT"   },
    { title:"Annual Fee Payment Due – Last Date July 31",  content:"Annual fees are due by July 31. Late fee of ₹50/day will be charged after the due date.",                role:null        },
    { title:"Parent-Teacher Meeting – October 5",          content:"PTM scheduled October 5, 10 AM–1 PM. Parents must collect report cards from class teachers.",            role:"PARENT"    },
    { title:"Annual Sports Day Registration Open",         content:"Register for Sports Day events with your PE teacher before September 30, 2025.",                         role:"STUDENT"   },
    { title:"200 New Books Added to Library",              content:"The library has received 200+ new books including NCERT latest editions. Students are encouraged to borrow.", role:"STUDENT"},
    { title:"Republic Day Celebration – Jan 26",           content:"All students must report in full school uniform by 8:00 AM on January 26, 2026.",                        role:null        },
    { title:"Staff Meeting – September 10",                content:"Mandatory staff meeting on September 10 at 3:30 PM in the conference hall.",                              role:"TEACHER"   },
  ];
  for (const n of notices) {
    await prisma.notice.create({
      data: { title: n.title, content: n.content, targetRole: n.role, publishedBy: adminUser.id, expiryDate: new Date("2026-03-31"), isActive: true },
    });
  }

  // ════════════════════════════════════════════════════════════════
  // 17. EVENTS
  // ════════════════════════════════════════════════════════════════
  const events = [
    { title:"Independence Day Celebration",    desc:"Flag hoisting and march past.",                          date:"2025-08-15", end:"2025-08-15", venue:"School Grounds",      org:"School Administration"   },
    { title:"Science Exhibition",              desc:"Students present innovative science projects.",          date:"2025-11-20", end:"2025-11-21", venue:"School Auditorium",   org:"Science Department"      },
    { title:"Diwali Cultural Program",         desc:"Cultural performances by students.",                     date:"2025-10-20", end:"2025-10-20", venue:"School Hall",         org:"Cultural Committee"       },
    { title:"Parent-Teacher Meeting",          desc:"Discuss student progress with class teachers.",          date:"2025-10-05", end:"2025-10-05", venue:"Classrooms",          org:"School Administration"   },
    { title:"Inter-School Debate Competition", desc:"Students represent school at regional debate.",          date:"2025-11-10", end:"2025-11-10", venue:"City Auditorium",     org:"English Department"      },
    { title:"Annual Sports Day",               desc:"Inter-house athletics, team sports, and games.",         date:"2026-01-15", end:"2026-01-16", venue:"School Grounds",      org:"Sports Department"       },
    { title:"Republic Day Celebration",        desc:"Flag hoisting, parade, and cultural performances.",     date:"2026-01-26", end:"2026-01-26", venue:"School Grounds",      org:"School Administration"   },
    { title:"Annual Prize Distribution",       desc:"Felicitation of academic and extracurricular achievers.", date:"2026-02-10", end:"2026-02-10", venue:"Main Auditorium",   org:"School Administration"   },
  ];
  for (const e of events) {
    await prisma.event.create({
      data: { title: e.title, description: e.desc, date: new Date(e.date), endDate: new Date(e.end), venue: e.venue, organizer: e.org, isActive: true },
    });
  }

  // ════════════════════════════════════════════════════════════════
  // DONE
  // ════════════════════════════════════════════════════════════════
  console.log("\n✅  Seeding complete!\n");
  console.log(`  School   : Green Valley Senior Secondary School`);
  console.log(`  Classes  : 6A · 6B · 7A · 8A · 9A · 10A  (6 classes)`);
  console.log(`  Teachers : ${teacherDefs.length}`);
  console.log(`  Students : ${allStudents.length}  (30 per class)`);
  console.log(`  Exams    : ${exams.length}  (Unit Test · Half Yearly · Annual)`);
  console.log(`  Att. days: ${attDays.length}  (Aug–Oct 2025)`);
  console.log(`  Books    : ${bookList.length}`);
  console.log("\n🔑  Login credentials (password: password123 for all except super admin):");
  console.log("  Super Admin : superadmin@eduportal.com  /  superadmin123");
  console.log("  School Admin: admin@gvss.edu.in");
  console.log("  Teacher 1   : rahul.sharma@gvss.edu.in");
  console.log("  Teacher 2   : priya.patel@gvss.edu.in");
  console.log("  Student 1   : aarav.kumar1@student.gvss.edu.in");
  console.log("  Parent 1    : parent1@gvss.edu.in");
}

main().catch(console.error).finally(() => prisma.$disconnect());
