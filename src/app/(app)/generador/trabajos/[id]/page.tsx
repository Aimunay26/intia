import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { generationStatus } from "@/lib/generation-jobs";
import JobProgress from "./progress";
import { aiStatus, getSettings, SETTING_KEYS } from "@/lib/settings";
import { resolveAiModel } from "@/lib/ai-models";

export default async function GenerationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("scripts.generate");
  const job = await generationStatus(user, (await params).id);
  if (!job) notFound();
  const [status, settings] = await Promise.all([aiStatus(), getSettings([SETTING_KEYS.defaultGoogleModel, SETTING_KEYS.defaultAnthropicModel])]);
  return <JobProgress key={job.id} initial={job} canManageAi={user.role === "OWNER"}
    providersReady={{ google: status.google.configured, anthropic: status.anthropic.configured }}
    defaultModels={{ google: resolveAiModel("google", undefined, settings[SETTING_KEYS.defaultGoogleModel]), anthropic: resolveAiModel("anthropic", undefined, settings[SETTING_KEYS.defaultAnthropicModel]) }} />;
}
