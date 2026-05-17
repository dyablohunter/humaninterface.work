import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * JOB applications were replaced by the unified reverse-auction model.
 * Bidding (all tiers, JOB included) happens on the task page itself.
 */
export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/open-work/${id}`);
}
