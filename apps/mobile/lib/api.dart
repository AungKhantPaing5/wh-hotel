import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'models.dart';

class ApiException implements Exception {
  final String message;
  final int? status;
  const ApiException(this.message, [this.status]);
  @override
  String toString() => message;
}

class WhApi {
  final String baseUrl;
  final http.Client client;
  final Future<String?> Function() token;
  WhApi({required this.baseUrl, required this.token, http.Client? client}) : client = client ?? http.Client();

  Future<dynamic> request(String path, {String method = 'GET', Map<String,dynamic>? body,
    bool authenticated = false, String? idempotencyKey}) async {
    final base = Uri.tryParse(baseUrl);
    if (base == null || base.scheme != 'https' || base.host.isEmpty || base.userInfo.isNotEmpty || base.hasQuery || base.hasFragment) {
      throw const ApiException('Configure a valid HTTPS hotel API URL before connecting.');
    }
    final headers = <String,String>{'Accept':'application/json'};
    if (authenticated) {
      final accessToken = await token();
      if (accessToken == null) throw const ApiException('Please sign in first.',401);
      headers['Authorization'] = 'Bearer $accessToken';
    }
    if (body != null) headers['Content-Type'] = 'application/json';
    if (idempotencyKey != null) headers['Idempotency-Key'] = idempotencyKey;
    final uri = Uri.parse('${baseUrl.replaceFirst(RegExp(r'/$'), '')}/$path');
    try {
      final req = http.Request(method,uri)..headers.addAll(headers);
      // Do not forward authenticated requests to a different origin through redirects.
      req.followRedirects = false;
      if (body != null) req.body = jsonEncode(body);
      final response = await client.send(req).then(http.Response.fromStream).timeout(const Duration(seconds:20));
      dynamic result;
      try { result = jsonDecode(response.body); }
      catch (_) { throw const ApiException('The hotel server returned an unexpected response.'); }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final message = result is Map ? result['message'] : null;
        throw ApiException(message is String ? message : 'Request failed. Please try again.', response.statusCode);
      }
      return result;
    } on TimeoutException {
      throw const ApiException('Connection timed out. For a booking request, retry without changing the stay to reuse its request key.');
    } on http.ClientException {
      throw const ApiException('Cannot reach the hotel. Check your connection and try again.');
    }
  }
  Future<List<Room>> rooms({Stay? stay}) async {
    final path = stay == null ? 'rooms' : 'availability?checkIn=${isoDate(stay.checkIn)}&checkOut=${isoDate(stay.checkOut)}';
    final data = await request(path) as List;
    return data.map((j) => Room.fromJson(Map<String,dynamic>.from(j as Map))).toList();
  }
  Future<List<Booking>> bookings() async => ((await request('bookings',authenticated:true)) as List)
    .map((j) => Booking.fromJson(Map<String,dynamic>.from(j as Map))).toList();
  Future<Map<String,dynamic>> profile() async => Map<String,dynamic>.from(await request('me',authenticated:true) as Map);
  Future<Booking> book(Room room, Stay stay, String key) async => Booking.fromJson(
    Map<String,dynamic>.from(await request('bookings',method:'POST',authenticated:true,
      body:stay.request(room.id),idempotencyKey:key) as Map));
  void close() => client.close();
}
