import 'package:flutter_test/flutter_test.dart';
import 'package:wh_mobile/models.dart';

void main(){
  test('hotel date uses Yangon across the UTC date boundary',(){
    expect(isoDate(hotelToday(DateTime.utc(2026,10,15,18))), '2026-10-16');
  });
  test('stay validates ordering, past dates and maximum nights',(){
    final today=DateTime(2099,1,1);
    expect(Stay(today,today,2).validate(today:today),isNotNull);
    expect(Stay(today,DateTime(2099,2,2),2).validate(today:today),isNotNull);
    expect(Stay(DateTime(2098,12,31),today,2).validate(today:today),isNotNull);
    expect(Stay(today,DateTime(2099,1,2),2).validate(today:today),isNull);
  });
  test('minor units remain exact beyond floating point integer precision',(){
    expect(money(BigInt.parse('900719925474099312')), '9,007,199,254,740,993.12 MMK');
  });
  test('server integer and string prices decode correctly',(){
    final room=Room.fromJson({'id':1,'name':'Deluxe','description':'Room','max_guests':2,'nightly_amount_minor':'8500000','amenities':['Wi-Fi'],'available_rooms':0});
    expect(room.available,0);
    expect(money(room.nightlyAmount),'85,000 MMK');
  });
}
