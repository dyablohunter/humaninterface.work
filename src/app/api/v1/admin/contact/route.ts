import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/middleware";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = 50;

  const [messages, total] = await Promise.all([
    prisma.contactMessage.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contactMessage.count(),
  ]);

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      body: m.body,
      userId: m.userId,
      createdAt: m.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total,
  });
}
