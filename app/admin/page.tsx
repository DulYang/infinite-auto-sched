import AdminDashboard from "./AdminDashboard";
import AuditLogViewer from "./AuditLogViewer";

export default function AdminPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Admin Dashboard</h1>
        <p className="text-neutral-500">
          Review bookings, confirm payments, and send WhatsApp confirmations.
        </p>
      </div>
      <AdminDashboard />
      <AuditLogViewer />
    </div>
  );
}
