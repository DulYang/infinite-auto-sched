import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminDashboard from "./AdminDashboard";
import AuditLogViewer from "./AuditLogViewer";
import SignOutButton from "./SignOutButton";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Dasbor Admin</h1>
          <p className="text-neutral-500 text-sm sm:text-base">
            Tinjau pemesanan, konfirmasi pembayaran, dan kirim konfirmasi WhatsApp.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:text-right">
          <p className="text-xs text-neutral-400 truncate">{user.email}</p>
          <SignOutButton />
        </div>
      </div>
      <AdminDashboard />
      <AuditLogViewer />
    </div>
  );
}
