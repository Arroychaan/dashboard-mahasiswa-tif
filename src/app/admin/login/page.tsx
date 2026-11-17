import { redirect } from "next/navigation";

import { AdminLoginForm } from "~/components/admin/AdminLoginForm";
import { getVerifiedServerSession } from "~/server/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const sessionResult = await getVerifiedServerSession();

  if (sessionResult.ok) {
    redirect("/admin");
  }

  return <AdminLoginForm />;
}
