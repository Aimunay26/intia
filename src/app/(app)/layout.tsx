import { requireUser } from "@/lib/auth";
import { ROLE_LEVEL } from "@/lib/constants";
import { getBrandContext } from "@/lib/brand-context";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { Shell } from "@/components/shell";

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
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        color: user.color,
        level: ROLE_LEVEL[user.role] ?? 1,
      }}
    >
      {children}
    </Shell>
  );
}
