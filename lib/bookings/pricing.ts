// Duration-based pricing. Must stay in sync with create_booking() in
// supabase/migrations/0014_hourly_pricing.sql, which is the enforcement
// point for the public booking flow.
export const PRICE_TWO_HOURS = 350000;
export const PRICE_ONE_HOUR = 250000;

export function priceForMinutes(minutes: number): number | null {
  if (minutes === 120) return PRICE_TWO_HOURS;
  if (minutes === 60) return PRICE_ONE_HOUR;
  return null;
}

export function slotMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}
