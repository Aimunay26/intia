import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { generationStatus } from "@/lib/generation-jobs";
import JobProgress from "./progress";

export default async function GenerationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("scripts.generate");
  const job = await generationStatus(user, (await params).id);
  if (!job) notFound();
  return <JobProgress key={job.id} initial={job} />;
}
