export type BookingStatus = "pending_payment" | "confirmed" | "completed";
export type SendStatus = "pending" | "sent" | "failed";
export type ReviewStatus = "unreviewed" | "approved" | "rejected";

export interface Court {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  created_at: string;
}

export interface TimeSlot {
  id: string;
  user_id: string | null;
  label: string;
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface Booking {
  id: string;
  user_id: string | null;
  court_id: string;
  slot_id: string;
  booking_date: string;
  client_name: string;
  client_phone: string;
  status: BookingStatus;
  amount_due: number;
  payment_confirmed_at: string | null;
  notes: string | null;
  created_at: string;
}

export type PaymentStatus = "pending" | "paid" | "failed";

export interface Payment {
  id: string;
  booking_id: string;
  provider: string;
  provider_ref: string | null;
  amount: number;
  status: PaymentStatus;
  raw_payload: Record<string, unknown> | null;
  paid_at: string | null;
  created_at: string;
}

export interface BookingWithRelations extends Booking {
  court: Court | null;
  slot: TimeSlot | null;
  whatsapp_logs?: WhatsAppLog[];
  payments?: Payment[];
}

export interface WhatsAppLog {
  id: string;
  user_id: string | null;
  booking_id: string;
  recipient_phone: string;
  message_body: string;
  send_status: SendStatus;
  sent_at: string | null;
  error_message: string | null;
  message_draft: string | null;
  message_draft_source: string | null;
  message_draft_confidence: number | null;
  message_draft_review_status: ReviewStatus | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  performed_by: string | null;
  created_at: string;
}
