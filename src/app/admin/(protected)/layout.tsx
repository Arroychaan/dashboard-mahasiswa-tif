import { redirect } from "next/navigation";

import { AdminShell } from "~/components/admin/AdminShell";
import { getVerifiedServerSession } from "~/server/auth/session";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sessionResult = await getVerifiedServerSession();

  if (!sessionResult.ok) {
    redirect("/admin/login");
  }

  return <AdminShell initialUser={sessionResult.userDto}>{children}</AdminShell>;
}

