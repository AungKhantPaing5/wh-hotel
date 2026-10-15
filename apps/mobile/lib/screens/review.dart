import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import '../api.dart';
import '../auth.dart';
import '../config.dart';
import '../models.dart';
import '../widgets.dart';
import 'account.dart';
import 'bookings.dart';

class ReviewPage extends StatefulWidget {
  final Room room;
  final Stay stay;
  final WhApi api;
  final WhSession session;
  const ReviewPage({super.key,required this.room,required this.stay,required this.api,required this.session});
  @override
  State<ReviewPage> createState()=>_ReviewPageState();
}
class _ReviewPageState extends State<ReviewPage> {
  bool submitting=false,accepted=false;
  String? error;
  Booking? result;
  String? requestKey;

  Future<void> submit() async {
    if(submitting||result!=null)return;
    final uid=widget.session.user?.uid;
    if(uid==null){showError(context,'Please sign in first.');return;}
    final validation=widget.stay.validate();
    if(validation!=null){showError(context,validation);return;}
    setState(() {submitting=true;error=null;});
    try {
      final profile=await widget.api.profile();
      if(profile['needsPhone']==true)throw const ApiException('Verify your phone in Account before requesting a booking.');
      if(widget.session.user?.uid!=uid)throw const ApiException('Account changed. Please review again.');
      final prefs=SharedPreferencesAsync();
      final storageKey='wh.pending.$uid.${jsonEncode(widget.stay.request(widget.room.id))}';
      // Save a retry key before sending. Never cache a token or claim offline success.
      requestKey ??= await prefs.getString(storageKey) ?? const Uuid().v4();
      await prefs.setString(storageKey,requestKey!);
      final booking=await widget.api.book(widget.room,widget.stay,requestKey!);
      if(widget.session.user?.uid!=uid)throw const ApiException('Account changed. Sign in to the original account and check My bookings.');
      if(mounted)setState(()=>result=booking);
      // A received success ends this intent. A new review can create a new
      // request, including after an expired stay. Failed requests keep the key.
      try { await prefs.remove(storageKey); } catch (_) { /* Keep safe retry behavior if local cleanup fails. */ }
    } catch(e){if(mounted)setState(()=>error=friendlyError(e));}
    finally{if(mounted)setState(()=>submitting=false);}
  }
  @override
  Widget build(BuildContext context)=>AnimatedBuilder(animation:widget.session,builder:(context,_) {
    if(result!=null)return Scaffold(appBar:AppBar(title:const Text('Booking request')),body:BookingDetails(booking:result!));
    final signedIn=widget.session.user!=null;
    return Scaffold(appBar:AppBar(title:const Text('Review your stay')),body:ListView(padding:const EdgeInsets.all(24),children:[
      Text(widget.room.name,style:Theme.of(context).textTheme.headlineMedium),const SizedBox(height:20),
      ListTile(contentPadding:EdgeInsets.zero,leading:const Icon(Icons.calendar_month),title:Text('${displayDate(widget.stay.checkIn)} → ${displayDate(widget.stay.checkOut)}'),subtitle:Text('${widget.stay.nights} nights · ${widget.stay.guests} guests · 1 room')),
      const Divider(),Text('Estimated total',style:Theme.of(context).textTheme.titleMedium),
      Text(money(widget.room.nightlyAmount*BigInt.from(widget.stay.nights),widget.room.currency),style:Theme.of(context).textTheme.headlineMedium),
      const Notice('No charge is made here. The server confirms the final price when the request is created. Admin approval is required within 30 minutes. Live payments are not enabled in this version.'),
      if(AppConfig.preview)const Notice('PREVIEW MODE · This stay cannot be submitted. Configure a live API and Firebase first.')
      else if(!signedIn)FilledButton.tonal(onPressed:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>Scaffold(appBar:AppBar(title:const Text('Sign in')),body:AccountPage(api:widget.api,session:widget.session)))),child:const Text('Sign in to continue')),
      if(signedIn&&widget.session.user?.phoneNumber==null)const Notice('Your phone number must be verified. Open Account to add it.'),
      if(signedIn&&(widget.session.user?.phoneNumber==null||widget.session.user?.emailVerified==false))
        OutlinedButton(onPressed:submitting?null:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>Scaffold(appBar:AppBar(title:const Text('Complete profile')),body:AccountPage(api:widget.api,session:widget.session)))),child:const Text('Complete profile')),
      CheckboxListTile(contentPadding:EdgeInsets.zero,value:accepted,onChanged:submitting?null:(v)=>setState(()=>accepted=v??false),title:const Text('I understand this is a request and is subject to hotel approval.')),
      if(error!=null)Notice(error!),
      FilledButton(onPressed:AppConfig.preview||!signedIn||!accepted||submitting?null:submit,child:Text(submitting?'Sending request…':'Request booking')),
      const SizedBox(height:12),const Text('If the connection times out, retry this same stay. Its saved request key helps the hotel avoid creating duplicate requests.'),
    ]));
  });
}
