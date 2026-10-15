import 'package:flutter/material.dart';
import '../api.dart';
import '../auth.dart';
import '../config.dart';
import '../models.dart';
import '../widgets.dart';
import 'review.dart';

class HomePage extends StatefulWidget {
  final WhApi api;
  final WhSession session;
  const HomePage({super.key,required this.api,required this.session});
  @override
  State<HomePage> createState()=>_HomePageState();
}
class _HomePageState extends State<HomePage> {
  late Stay stay;
  List<Room> rooms=[];
  bool loading=true,searched=false;
  String? error;
  int requestVersion=0;
  @override
  void initState(){super.initState();final tomorrow=hotelToday().add(const Duration(days:1));stay=Stay(tomorrow,tomorrow.add(const Duration(days:1)),2);load();}
  Future<void> load({bool search=false}) async {
    final validation=stay.validate();
    if(search&&validation!=null){showError(context,validation);return;}
    final version=++requestVersion;
    setState(() {loading=true;error=null;});
    try {
      final result=AppConfig.preview?previewRooms():await widget.api.rooms(stay:search?stay:null);
      if(!mounted||version!=requestVersion)return;
      setState(() {rooms=result;loading=false;searched=search;});
    } catch(e){if(mounted&&version==requestVersion)setState(() {loading=false;error=friendlyError(e);});}
  }
  Future<void> pickDates() async {
    final today=hotelToday();
    final range=await showDateRangePicker(context:context,firstDate:today,lastDate:today.add(const Duration(days:730)),
      initialDateRange:DateTimeRange(start:stay.checkIn,end:stay.checkOut),helpText:'SELECT YOUR STAY',saveText:'Choose dates');
    if(range!=null&&mounted){setState(() {stay=Stay(range.start,range.end,stay.guests);searched=false;rooms=[];});}
  }
  @override
  Widget build(BuildContext context)=>RefreshIndicator(onRefresh:()=>load(search:searched),child:ListView(padding:const EdgeInsets.all(20),children:[
    Container(padding:const EdgeInsets.all(28),decoration:BoxDecoration(color:forest,borderRadius:BorderRadius.circular(22)),child:const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text('A PERSONAL WELCOME',style:TextStyle(color:Colors.white70,letterSpacing:2,fontSize:10)),SizedBox(height:20),
      Text('Slow down.\nStay a little longer.',style:TextStyle(fontFamily:'serif',fontSize:35,height:1.12,color:Colors.white)),
      SizedBox(height:20),Text('Thoughtful comforts. A space to unwind. Your next stay at WH.',style:TextStyle(color:Colors.white70)),
    ])),
    if(AppConfig.preview)const Notice('PREVIEW MODE · Sample rooms and prices. No live availability, login or booking submission. Configure the hotel API to connect.'),
    const SizedBox(height:24),Text('Plan your stay',style:Theme.of(context).textTheme.titleLarge),const SizedBox(height:12),
    OutlinedButton.icon(onPressed:pickDates,icon:const Icon(Icons.date_range),label:Padding(padding:const EdgeInsets.symmetric(vertical:14),child:Text('${displayDate(stay.checkIn)} → ${displayDate(stay.checkOut)}'))),
    const SizedBox(height:12),DropdownButtonFormField<int>(initialValue:stay.guests,decoration:const InputDecoration(labelText:'Guests'),items:[1,2,3,4].map((n)=>DropdownMenuItem(value:n,child:Text('$n ${n==1?'guest':'guests'}'))).toList(),onChanged:(n)=>setState(()=>stay=Stay(stay.checkIn,stay.checkOut,n!))),
    const SizedBox(height:12),FilledButton(onPressed:loading?null:()=>load(search:true),child:Text(AppConfig.preview?'Browse sample rooms':'Check availability')),
    const SizedBox(height:28),Text('Room to unwind.',style:Theme.of(context).textTheme.headlineMedium),
    const Text('Room illustrations shown. Hotel photography can be added in a later update.'),const SizedBox(height:20),
    if(loading)const Center(child:Padding(padding:EdgeInsets.all(28),child:CircularProgressIndicator()))
    else if(error!=null)Column(children:[Notice(error!),TextButton(onPressed:()=>load(search:searched),child:const Text('Try again'))])
    else if(rooms.isEmpty)const Notice('Choose your dates and check availability to see rooms.')
    else ...rooms.map((r)=>Padding(padding:const EdgeInsets.only(bottom:22),child:Card(margin:EdgeInsets.zero,clipBehavior:Clip.antiAlias,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      RoomArt(r),Padding(padding:const EdgeInsets.all(18),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(r.name,style:Theme.of(context).textTheme.titleLarge),const SizedBox(height:8),Text(r.description),const SizedBox(height:12),
        Wrap(spacing:6,runSpacing:4,children:r.amenities.map((a)=>Chip(label:Text(a,style:const TextStyle(fontSize:11)))).toList()),
        Text('Up to ${r.maxGuests} guests${r.available==null?'':' · ${r.available} rooms available'}'),
        const SizedBox(height:14),Text(money(r.nightlyAmount,r.currency),style:const TextStyle(fontSize:21,fontWeight:FontWeight.bold)),
        const Text('per night · current base rate'),const SizedBox(height:14),SizedBox(width:double.infinity,child:FilledButton.tonal(
          onPressed:r.available==0||r.maxGuests<stay.guests?null:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>RoomDetails(room:r,stay:stay,api:widget.api,session:widget.session))),
          child:Text(r.available==0?'Sold out':r.maxGuests<stay.guests?'Choose fewer guests':'View room'),
        )),
      ])),
    ])))),
  ]));
}

class RoomDetails extends StatelessWidget {
  final Room room;
  final Stay stay;
  final WhApi api;
  final WhSession session;
  const RoomDetails({super.key,required this.room,required this.stay,required this.api,required this.session});
  @override
  Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text(room.name)),body:ListView(padding:const EdgeInsets.all(20),children:[
    RoomArt(room,height:250),const SizedBox(height:24),Text(room.name,style:Theme.of(context).textTheme.headlineMedium),
    const SizedBox(height:12),Text(room.description),const SizedBox(height:20),
    ...room.amenities.map((a)=>ListTile(contentPadding:EdgeInsets.zero,leading:const Icon(Icons.check_circle_outline),title:Text(a))),
    const Divider(),ListTile(contentPadding:EdgeInsets.zero,leading:const Icon(Icons.people_outline),title:Text('Up to ${room.maxGuests} guests')),
    Text('${displayDate(stay.checkIn)} → ${displayDate(stay.checkOut)}'),Text('${stay.nights} nights · ${stay.guests} guests'),
    const SizedBox(height:20),Text('Estimated ${money(room.nightlyAmount*BigInt.from(stay.nights),room.currency)}',style:Theme.of(context).textTheme.titleLarge),
    const Notice('This is a booking request. The hotel must approve it. Final availability and total are checked on the server. Online payment is not enabled yet.'),
    FilledButton(onPressed:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>ReviewPage(room:room,stay:stay,api:api,session:session))),child:const Text('Review stay')),
  ]));
}
