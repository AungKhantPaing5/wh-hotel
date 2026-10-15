export function validateStay(checkIn: unknown, checkOut: unknown): [string, string] {
  const valid = (v: unknown): v is string => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const date = new Date(v + 'T00:00:00Z');
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v;
  };
  if (!valid(checkIn) || !valid(checkOut) || checkOut <= checkIn) {
    throw new Error('Valid check-in and later check-out dates are required.');
  }
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yangon', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  if (checkIn < today) throw new Error('Check-in cannot be in the past.');
  const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
  if (nights > 30) throw new Error('Maximum stay is 30 nights.');
  return [checkIn, checkOut];
}
