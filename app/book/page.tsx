import BookingForm from "./BookingForm";

export default function BookPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Book a Court</h1>
      <p className="text-neutral-500 mb-6">
        Pick a date, court, and time slot. We&apos;ll confirm your booking as soon as payment is received.
      </p>
      <BookingForm />
    </div>
  );
}
