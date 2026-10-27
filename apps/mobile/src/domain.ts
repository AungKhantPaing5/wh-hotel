export interface Room {
  id: number;
  name: string;
  description: string;
  max_guests: number;
  nightly_amount_minor: string | number;
  currency: string;
  amenities: string[];
  available_rooms?: number;
  photo_urls?: string[];
  room_numbers?: string[];
}
export interface Stay {
  checkIn: string;
  checkOut: string;
  guests: number;
}
export interface Booking {
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  id: string;
  check_in: string;
  check_out: string;
  status: string;
  total_amount_minor: string;
  currency: string;
  expires_at: string | null;
  room_number?: string;
  room_type?: string;
}
export function hotelToday(now = new Date()): string {
  return new Date(now.getTime() + 390 * 60000).toISOString().slice(0, 10);
}
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function nights(stay: Stay): number {
  return (
    (Date.parse(`${stay.checkOut}T00:00:00Z`) -
      Date.parse(`${stay.checkIn}T00:00:00Z`)) /
    86400000
  );
}
export function validateStay(stay: Stay, today = hotelToday()): string | null {
  if (!validDate(stay.checkIn) || !validDate(stay.checkOut))
    return "Enter valid dates as YYYY-MM-DD.";
  if (stay.checkIn < today)
    return "Check-in cannot be in the past (Myanmar time).";
  if (nights(stay) < 1 || nights(stay) > 30)
    return "Choose a stay between 1 and 30 nights.";
  if (!Number.isInteger(stay.guests) || stay.guests < 1 || stay.guests > 4)
    return "Choose 1 to 4 guests.";
  return null;
}
export function money(value: string | number, currency = "MMK"): string {
  const minor = BigInt(value),
    whole = minor / 100n,
    fraction = minor % 100n;
  return `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction.toString().padStart(2, "0")}` : ""} ${currency}`;
}
export function effectiveStatus(booking: Booking, now = Date.now()): string {
  return booking.expires_at &&
    Date.parse(booking.expires_at) <= now &&
    ["PENDING_APPROVAL", "AWAITING_PAYMENT"].includes(booking.status)
    ? "EXPIRED"
    : booking.status;
}
export function bookingFingerprint(
  uid: string,
  room: Room,
  stay: Stay,
): string {
  return JSON.stringify([
    uid,
    room.id,
    stay.checkIn,
    stay.checkOut,
    stay.guests,
  ]);
}
export const previewRooms: Room[] = [
  {
    id: 1,
    name: "Deluxe Double",
    description: "A calm retreat for two with a comfortable king bed.",
    max_guests: 2,
    nightly_amount_minor: "8500000",
    currency: "MMK",
    amenities: ["Wi-Fi", "Air conditioning", "Breakfast"],
  },
  {
    id: 2,
    name: "Family Suite",
    description: "More space to relax together after a day exploring.",
    max_guests: 4,
    nightly_amount_minor: "14500000",
    currency: "MMK",
    amenities: ["Wi-Fi", "Living area", "Breakfast"],
  },
];

export const validContactPhone = (phone: string) =>
  phone.length === 11 && /^09[0-9]{9}$/.test(phone);
