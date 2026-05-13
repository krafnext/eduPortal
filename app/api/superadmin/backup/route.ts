/**
 * Database backup API — runs mysqldump and gzips the output.
 *
 * Requirements:
 *   - mysqldump must be installed on the server
 *   - The BACKUP_DIR directory must be writable (default: ./backups)
 *   - Set BACKUP_DIR env var to override the backup path
 *   - Set MAX_BACKUPS env var to change retention (default: 10)
 *
 * Restore instructions (run on MySQL client):
 *   gunzip backup_<db>_<date>.sql.gz
 *   mysql -h <host> -u <user> -p <database> < backup_<db>_<date>.sql
 *
 * Security note: The backup file contains all data. Restrict access to
 * the /backups directory (add to .gitignore, set appropriate file perms).
 */

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin-guard";
import { spawn } from "child_process";
import { createWriteStream, readdirSync, statSync, unlinkSync } from "fs";
import { mkdir } from "fs/promises";
import { createGzip } from "zlib";
import path from "path";

export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const BACKUP_DIR = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS ?? "10");

interface BackupFile {
  name: string;
  size: number;
  sizeLabel: string;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function listBackups(): BackupFile[] {
  try {
    return readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("backup_") && f.endsWith(".sql.gz"))
      .map((f) => {
        const stat = statSync(path.join(BACKUP_DIR, f));
        return { name: f, size: stat.size, sizeLabel: formatBytes(stat.size), createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

function pruneOldBackups() {
  const files = listBackups();
  for (const file of files.slice(MAX_BACKUPS)) {
    try { unlinkSync(path.join(BACKUP_DIR, file.name)); } catch {}
  }
}

function runBackup(): Promise<{ fileName: string; size: number; sizeLabel: string }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not configured");

  const url = new URL(dbUrl);
  const host = url.hostname;
  const port = url.port || "3306";
  const database = url.pathname.slice(1);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `backup_${database}_${timestamp}.sql.gz`;
  const filePath = path.join(BACKUP_DIR, fileName);

  return new Promise((resolve, reject) => {
    const args = [
      `--host=${host}`,
      `--port=${port}`,
      `--user=${username}`,
      `--single-transaction`,
      `--routines`,
      `--triggers`,
      `--no-tablespaces`,
      database,
    ];

    // Pass password via env variable to avoid "password on command line" warning
    const env = { ...process.env, MYSQL_PWD: password };
    const dump = spawn("mysqldump", args, { env });
    const gzip = createGzip();
    const output = createWriteStream(filePath);

    dump.stdout.pipe(gzip).pipe(output);

    let stderrBuf = "";
    dump.stderr.on("data", (d: Buffer) => { stderrBuf += d.toString(); });

    output.on("finish", () => {
      const size = statSync(filePath).size;
      pruneOldBackups();
      resolve({ fileName, size, sizeLabel: formatBytes(size) });
    });

    dump.on("error", (err: Error) => {
      if (err.message.includes("ENOENT")) {
        reject(new Error("mysqldump not found. Install MySQL client tools on the server."));
      } else {
        reject(new Error(`mysqldump error: ${err.message}`));
      }
    });

    dump.on("close", (code: number) => {
      if (code !== 0) {
        const msg = stderrBuf.replace(/\n/g, " ").slice(0, 200);
        reject(new Error(`mysqldump exited with code ${code}: ${msg}`));
      }
    });

    output.on("error", reject);
  });
}

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  await mkdir(BACKUP_DIR, { recursive: true }).catch(() => {});
  const backups = listBackups();
  return NextResponse.json({ backups, backupDir: BACKUP_DIR, maxBackups: MAX_BACKUPS });
}

export async function POST() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  await mkdir(BACKUP_DIR, { recursive: true });

  try {
    const result = await runBackup();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const fileName = searchParams.get("file");
  if (!fileName || !fileName.endsWith(".sql.gz") || fileName.includes("/") || fileName.includes("..")) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }

  try {
    unlinkSync(path.join(BACKUP_DIR, fileName));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
