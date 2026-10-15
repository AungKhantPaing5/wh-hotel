import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wh_mobile/api.dart';
import 'package:wh_mobile/auth.dart';
import 'package:wh_mobile/main.dart';

void main(){
  testWidgets('preview rooms and account are usable without Firebase or network',(tester)async{
    final session=WhSession();
    final api=WhApi(baseUrl:'',token:()async=>null);
    await tester.pumpWidget(WhApp(session:session,api:api));
    await tester.pumpAndSettle();
    expect(find.textContaining('PREVIEW MODE'),findsOneWidget);
    await tester.tap(find.text('Account').last);
    await tester.pumpAndSettle();
    expect(find.text('Your WH account'),findsOneWidget);
    final button=tester.widget<FilledButton>(find.widgetWithText(FilledButton,'Sign in'));
    expect(button.onPressed,isNull);
    await tester.pumpWidget(const SizedBox());session.dispose();api.close();
  });
}
