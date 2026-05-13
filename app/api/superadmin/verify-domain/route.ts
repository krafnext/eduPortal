import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin-guard";
import { promises as dns } from "dns";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  domain: z.string().min(3),
  token: z.string().min(10),
});

export async function POST(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { domain, token } = schema.parse(await req.json());

  try {
    // Strip protocol/www if user accidentally included them
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const records = await dns.resolveTxt(cleanDomain);
    const flat = records.flat();
    const verified = flat.some((r) => r.includes(token));

    return NextResponse.json({ verified, checkedDomain: cleanDomain });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return NextResponse.json({ verified: false, error: "Domain not found or no TXT records" });
    }
    console.error("DNS lookup failed:", err);
    return NextResponse.json({ verified: false, error: "DNS lookup failed" });
  }
}
