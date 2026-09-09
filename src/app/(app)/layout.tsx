import { Shell } from "@/components/shell";
import { ROLE_LEVEL } from "@/lib/constants";
import { getPageBrandContext as getBrandContext, requirePageUser as requireUser } from "@/lib/render-context";
import { getSetting, SETTING_KEYS } from "@/lib/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [orgName, brandCtx] = await Promise.all([
    getSetting(SETTING_KEYS.orgName),
    getBrandContext(),
  ]);

  return (
    <Shell
      orgName={orgName || "Mi agencia"}
      brands={brandCtx.brands}
      activeBrandId={brandCtx.activeId}
      performanceEnabled={process.env.PERFORMANCE_LOGS === "1"}
      release={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.PERFORMANCE_RELEASE ?? "local"}
      environment={process.env.VERCEL_ENV ?? process.env.PERFORMANCE_ENVIRONMENT ?? "local"}
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        color: user.color,
        level: ROLE_LEVEL[user.role] ?? 0, profiles: user.profiles,
      }}
    >
      {children}
    </Shell>
  );
}
