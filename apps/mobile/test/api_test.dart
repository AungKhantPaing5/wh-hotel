import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:wh_mobile/api.dart';
import 'package:wh_mobile/models.dart';

void main(){
  test('authenticated booking sends a token and stable request key, never client price',()async{
    final api=WhApi(baseUrl:'https://hotel.example/api',token:()async=>'verified-token',client:MockClient((request)async{
      expect(request.url.path,'/api/bookings');
      expect(request.headers['Authorization'],'Bearer verified-token');
      expect(request.headers['Idempotency-Key'],'request-123');
      expect(request.followRedirects,isFalse);
      final body=jsonDecode(request.body) as Map;
      expect(body.containsKey('total'),isFalse);
      expect(body['roomTypeId'],1);
      return http.Response(jsonEncode({'id':'b1','status':'PENDING_APPROVAL','currency':'MMK','check_in':'2099-01-01','check_out':'2099-01-02','total_amount_minor':'8500000'}),201);
    }));
    final booking=await api.book(previewRooms().first,Stay(DateTime(2099),DateTime(2099,1,2),2),'request-123');
    expect(booking.status,'PENDING_APPROVAL');
    api.close();
  });
  test('rejects credentials over insecure API connection',()async{
    final api=WhApi(baseUrl:'http://hotel.example/api',token:()async=>'secret');
    await expectLater(api.profile(),throwsA(isA<ApiException>()));api.close();
  });
  test('sold out response remains an error rather than fake booking success',()async{
    final api=WhApi(baseUrl:'https://hotel.example/api',token:()async=>'token',client:MockClient((_)async=>http.Response('{"message":"No room available"}',409)));
    await expectLater(api.request('bookings',authenticated:true),throwsA(isA<ApiException>().having((e)=>e.status,'status',409)));api.close();
  });
  test('no token means private endpoint is not contacted',()async{
    var contacted=false;
    final api=WhApi(baseUrl:'https://hotel.example/api',token:()async=>null,client:MockClient((_)async{contacted=true;return http.Response('[]',200);}));
    await expectLater(api.bookings(),throwsA(isA<ApiException>()));expect(contacted,isFalse);api.close();
  });
}
