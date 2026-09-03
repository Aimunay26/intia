import { NextResponse } from "next/server";

import { destroySession, getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getSession();
  if (user) {
    await logAudit({
      user,
      action: "LOGOUT",
      entity: "Auth",
      entityId: user.id,
      summary: `${user.name} cerró sesión`,
    });
  }
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
