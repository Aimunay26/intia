import { notFound } from "next/navigation";
import { requireLevel, LEVEL } from "@/lib/auth";
import { generationStatus } from "@/lib/generation-jobs";
import JobProgress from "./progress";

export default async function GenerationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireLevel(LEVEL.MEMBER);
  const job = await generationStatus(user, (await params).id);
  if (!job) notFound();
  return <JobProgress initial={job} />;
}
