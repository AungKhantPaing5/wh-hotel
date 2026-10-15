import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../api.dart';
import '../auth.dart';
import '../config.dart';
import '../models.dart';
import '../widgets.dart';

class BookingsPage extends StatefulWidget {
  final WhApi api;
  final WhSession session;
  final bool active;
  final VoidCallback onAccount;
  const BookingsPage({super.key,required this.api,required this.session,required this.active,required this.onAccount});
  @override
  State<BookingsPage> createState()=>_BookingsPageState();
}
class _BookingsPageState extends State<BookingsPage> with WidgetsBindingObserver {
  List<Booking> rows=[];
  bool loading=false;
  String? error;
  int version=0;
  Timer? timer;
  @override
  void initState(){super.initState();WidgetsBinding.instance.addObserver(this);widget.session.addListener(sessionChanged);timer=Timer.periodic(const Duration(seconds:30),(_){if(widget.active)load();});}
  void sessionChanged(){version++;setState(() {rows=[];error=null;loading=false;});if(widget.active)load();}
  @override
  void didUpdateWidget(covariant BookingsPage old){super.didUpdateWidget(old);if(widget.active&&!old.active)load();}
  @override
  void didChangeAppLifecycleState(AppLifecycleState state){if(state==AppLifecycleState.resumed&&widget.active)load();}
  Future<void> load() async {
    if(AppConfig.preview||widget.session.user==null||loading)return;
    final request=++version;
    setState(() {loading=true;error=null;});
    try {final data=await widget.api.bookings();if(mounted&&request==version)setState(()=>rows=data);}
    catch(e){if(mounted&&request==version)setState(()=>error=friendlyError(e));}
    finally{if(mounted&&request==version)setState(()=>loading=false);}
  }
  @override
  void dispose(){timer?.cancel();widget.session.removeListener(sessionChanged);WidgetsBinding.instance.removeObserver(this);super.dispose();}
  @override
  Widget build(BuildContext context)=>AnimatedBuilder(animation:widget.session,builder:(context,_){
    if(AppConfig.preview)return const EmptyState(icon:Icons.receipt_long_outlined,title:'Your stays, in one place',message:'Preview mode has no real bookings. Connect the hotel API and sign in to see your history.');
    if(widget.session.user==null)return EmptyState(icon:Icons.lock_outline,title:'Your booking history',message:'Sign in to securely view your own booking requests.',action:FilledButton(onPressed:widget.onAccount,child:const Text('Sign in')));
    return RefreshIndicator(onRefresh:load,child:ListView(physics:const AlwaysScrollableScrollPhysics(),padding:const EdgeInsets.all(20),children:[
      Row(mainAxisAlignment:MainAxisAlignment.spaceBetween,children:[Text('My bookings',style:Theme.of(context).textTheme.headlineMedium),IconButton(tooltip:'Refresh bookings',onPressed:loading?null:load,icon:const Icon(Icons.refresh))]),
      const Text('Pull to refresh. Active requests also refresh every 30 seconds.'),
      if(loading)const LinearProgressIndicator(),if(error!=null)Notice(error!),
      if(!loading&&rows.isEmpty&&error==null)const Notice('No bookings yet. Explore our rooms to plan your first stay.'),
      ...rows.map((b)=>Card(child:ListTile(contentPadding:const EdgeInsets.all(18),leading:Icon(b.effectiveStatus=='CONFIRMED'?Icons.check_circle_outline:Icons.receipt_long_outlined),title:Text(b.label),subtitle:Text('${displayDate(b.checkIn)} → ${displayDate(b.checkOut)}\n${money(b.total,b.currency)}'),isThreeLine:true,trailing:const Icon(Icons.chevron_right),onTap:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>Scaffold(appBar:AppBar(title:const Text('Booking details')),body:BookingDetails(booking:b))))))),
    ]));
  });
}

class BookingDetails extends StatelessWidget {
  final Booking booking;
  const BookingDetails({super.key,required this.booking});
  @override
  Widget build(BuildContext context)=>ListView(padding:const EdgeInsets.all(24),children:[
    const Icon(Icons.receipt_long_outlined,size:62,color:forest),const SizedBox(height:20),
    Text(booking.label,style:Theme.of(context).textTheme.headlineMedium,textAlign:TextAlign.center),const SizedBox(height:20),
    const Text('BOOKING REFERENCE',style:TextStyle(letterSpacing:2,fontSize:11)),SelectableText(booking.id),
    TextButton.icon(onPressed:()async{await Clipboard.setData(ClipboardData(text:booking.id));if(context.mounted)showError(context,'Booking reference copied.');},icon:const Icon(Icons.copy),label:const Text('Copy reference')),
    const Divider(),ListTile(contentPadding:EdgeInsets.zero,title:const Text('Check-in'),trailing:Text(displayDate(booking.checkIn))),
    ListTile(contentPadding:EdgeInsets.zero,title:const Text('Check-out'),trailing:Text(displayDate(booking.checkOut))),
    ListTile(contentPadding:EdgeInsets.zero,title:const Text('Server total'),subtitle:Text(money(booking.total,booking.currency),style:Theme.of(context).textTheme.headlineSmall)),
    if(booking.effectiveStatus=='PENDING_APPROVAL')const Notice('Your request is waiting for hotel approval. It expires if the hotel does not accept within 30 minutes.'),
    if(booking.effectiveStatus=='AWAITING_PAYMENT')const Notice('The hotel accepted this request. Online payment is not connected in this version; this request will expire when its payment deadline passes. No payment has been collected by this app.'),
    if(booking.effectiveStatus=='EXPIRED')const Notice('This request expired and no longer reserves the room. Check availability before creating another request.'),
    if(booking.expiresAt!=null)Text('Deadline: ${booking.expiresAt!.toUtc().add(const Duration(hours:6,minutes:30)).toString().substring(0,16)} (Yangon)'),
    const Notice('Payment integration is not enabled. This app never marks a booking as paid from a screenshot or a return page.'),
  ]);
}
