import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/middleware";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = 50;

  const [suggestions, total] = await Promise.all([
    prisma.suggestion.findMany({
      include: { user: { select: { username: true, role: true, solanaPubkey: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.suggestion.count(),
  ]);

  return NextResponse.json({
    suggestions: suggestions.map((s) => ({
      id: s.id,
      body: s.body,
      createdAt: s.createdAt.getTime(),
      user: s.user,
    })),
    page,
    pageSize,
    total,
  });
}
