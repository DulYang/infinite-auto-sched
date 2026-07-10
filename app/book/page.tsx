import BookingForm from "./BookingForm";

export default function BookPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Pesan Lapangan</h1>
      <p className="text-neutral-500 mb-6">
        Pilih tanggal, lapangan, dan slot waktu. Kami akan mengonfirmasi pemesanan Anda setelah pembayaran diterima.
      </p>
      <BookingForm />
    </div>
  );
}
