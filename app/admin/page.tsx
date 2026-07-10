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
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Dasbor Admin</h1>
          <p className="text-neutral-500">
            Tinjau pemesanan, konfirmasi pembayaran, dan kirim konfirmasi WhatsApp.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-400 mb-1">{user.email}</p>
          <SignOutButton />
        </div>
      </div>
      <AdminDashboard />
      <AuditLogViewer />
    </div>
  );
}
