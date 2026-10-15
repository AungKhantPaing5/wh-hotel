import 'package:intl/intl.dart';

DateTime hotelToday([DateTime? now]) {
  final d = (now ?? DateTime.now()).toUtc().add(
    const Duration(hours: 6, minutes: 30),
  );
  return DateTime(d.year, d.month, d.day);
}

String isoDate(DateTime date) => DateFormat('yyyy-MM-dd').format(date);
String displayDate(DateTime date) => DateFormat('d MMM yyyy').format(date);
String money(BigInt minor, [String currency = 'MMK']) {
  final whole = minor ~/ BigInt.from(100);
  final fraction = (minor % BigInt.from(100)).toInt();
  final formatted = whole.toString().replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
    (m) => '${m[1]},',
  );
  return '$formatted${fraction == 0 ? '' : '.${fraction.toString().padLeft(2, '0')}'} $currency';
}

class Stay {
  final DateTime checkIn;
  final DateTime checkOut;
  final int guests;
  const Stay(this.checkIn, this.checkOut, this.guests);
  int get nights => DateTime.utc(
    checkOut.year,
    checkOut.month,
    checkOut.day,
  ).difference(DateTime.utc(checkIn.year, checkIn.month, checkIn.day)).inDays;
  String? validate({DateTime? today}) {
    if (checkIn.isBefore(today ?? hotelToday()))
      return 'Check-in cannot be in the past.';
    if (nights < 1) return 'Check-out must be after check-in.';
    if (nights > 30) return 'A stay can be at most 30 nights.';
    if (guests < 1 || guests > 4) return 'Select 1 to 4 guests.';
    return null;
  }

  Map<String, dynamic> request(int roomTypeId) => {
    'roomTypeId': roomTypeId,
    'checkIn': isoDate(checkIn),
    'checkOut': isoDate(checkOut),
    'guests': guests,
  };
}

class Room {
  final int id;
  final String name, description, currency;
  final int maxGuests;
  final BigInt nightlyAmount;
  final List<String> amenities;
  final int? available;
  Room({
    required this.id,
    required this.name,
    required this.description,
    required this.maxGuests,
    required this.nightlyAmount,
    required this.amenities,
    this.currency = 'MMK',
    this.available,
  });
  factory Room.fromJson(Map<String, dynamic> j) => Room(
    id: j['id'] as int,
    name: j['name'] as String,
    description: j['description'] as String,
    maxGuests: j['max_guests'] as int,
    nightlyAmount: BigInt.parse('${j['nightly_amount_minor']}'),
    currency: j['currency'] as String? ?? 'MMK',
    amenities: List<String>.from(j['amenities'] as List? ?? []),
    available: j['available_rooms'] as int?,
  );
}

class Booking {
  final String id, status, currency;
  final DateTime checkIn, checkOut;
  final DateTime? expiresAt;
  final BigInt total;
  Booking.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      status = j['status'] as String,
      currency = j['currency'] as String,
      checkIn = DateTime.parse('${j['check_in']}'.substring(0, 10)),
      checkOut = DateTime.parse('${j['check_out']}'.substring(0, 10)),
      expiresAt = j['expires_at'] == null
          ? null
          : DateTime.parse(j['expires_at'] as String),
      total = BigInt.parse('${j['total_amount_minor']}');
  String get effectiveStatus =>
      expiresAt != null &&
          expiresAt!.isBefore(DateTime.now()) &&
          ['PENDING_APPROVAL', 'AWAITING_PAYMENT'].contains(status)
      ? 'EXPIRED'
      : status;
  String get label => effectiveStatus
      .toLowerCase()
      .split('_')
      .map((s) => '${s[0].toUpperCase()}${s.substring(1)}')
      .join(' ');
}

List<Room> previewRooms() => [
  Room(
    id: 1,
    name: 'Deluxe Double',
    description: 'A calm retreat for two with a comfortable king bed.',
    maxGuests: 2,
    nightlyAmount: BigInt.from(8500000),
    amenities: ['Wi-Fi', 'Air conditioning', 'Breakfast'],
  ),
  Room(
    id: 2,
    name: 'Family Suite',
    description: 'More space to relax together after a day exploring.',
    maxGuests: 4,
    nightlyAmount: BigInt.from(14500000),
    amenities: ['Wi-Fi', 'Living area', 'Breakfast'],
  ),
];
