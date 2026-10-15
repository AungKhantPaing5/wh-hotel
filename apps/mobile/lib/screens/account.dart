import 'dart:async';
import 'package:flutter/material.dart';
import '../api.dart';
import '../auth.dart';
import '../config.dart';
import '../widgets.dart';

class AccountPage extends StatefulWidget {
  final WhApi api;
  final WhSession session;
  const AccountPage({super.key,required this.api,required this.session});
  @override
  State<AccountPage> createState()=>_AccountPageState();
}
class _AccountPageState extends State<AccountPage> {
  final email=TextEditingController(),password=TextEditingController(),phone=TextEditingController(),otp=TextEditingController();
  bool busy=false,signup=false,otpSent=false;
  String? message;
  int cooldown=0;
  Timer? timer;
  Future<Map<String,dynamic>>? profile;
  @override
  void initState(){super.initState();widget.session.addListener(changed);if(widget.session.user!=null)profile=widget.api.profile();}
  void changed(){if(!mounted)return;setState((){profile=widget.session.user==null?null:widget.api.profile();});}
  Future<void> run(Future<void> Function() action,{String? success})async{
    if(busy)return;
    setState(() {busy=true;message=null;});
    try{await action();if(mounted)setState(()=>message=success);}
    catch(e){if(mounted)setState(()=>message=friendlyError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> sendOtp()async{
    if(cooldown>0)return;
    await widget.session.sendPhone(phone.text.trim(),
      codeSent:(){if(!mounted)return;setState(() {otpSent=true;busy=false;message='SMS code sent.';});},
      verified:(){if(!mounted)return;setState(() {otpSent=false;busy=false;message='Phone verified.';});},
      failed:(e){if(!mounted)return;setState(() {busy=false;message=friendlyError(e);});},
    );
    if(!mounted)return;
    setState(()=>cooldown=60);
    timer?.cancel();timer=Timer.periodic(const Duration(seconds:1),(t){if(!mounted){t.cancel();return;}setState(()=>cooldown--);if(cooldown<=0)t.cancel();});
  }
  @override
  void dispose(){widget.session.removeListener(changed);timer?.cancel();email.dispose();password.dispose();phone.dispose();otp.dispose();super.dispose();}
  @override
  Widget build(BuildContext context)=>AnimatedBuilder(animation:widget.session,builder:(context,_){
    final user=widget.session.user;
    return ListView(padding:const EdgeInsets.all(24),children:[
      Text(user==null?'Your WH account':'Welcome back',style:Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height:8),const Text('One account for the WH website and mobile app.'),
      if(AppConfig.preview||!widget.session.enabled)Notice(widget.session.initializationError??'This build is not connected to Firebase. Sign-in is disabled until the hotel configuration is supplied.'),
      if(message!=null)Notice(message!),if(busy)const LinearProgressIndicator(),const SizedBox(height:16),
      if(user==null)...[
        FilledButton.tonal(onPressed:busy||!widget.session.enabled?null:()=>run(widget.session.google),child:const Text('Continue with Google')),
        const SizedBox(height:10),OutlinedButton(onPressed:busy||!widget.session.enabled?null:()=>run(widget.session.apple),child:const Text('Continue with Apple')),
        const SizedBox(height:24),Text(signup?'Create an account':'Email sign-in',style:Theme.of(context).textTheme.titleLarge),const SizedBox(height:12),
        TextField(controller:email,keyboardType:TextInputType.emailAddress,autofillHints:const[AutofillHints.email],decoration:const InputDecoration(labelText:'Email')),
        const SizedBox(height:12),TextField(controller:password,obscureText:true,autofillHints:[signup?AutofillHints.newPassword:AutofillHints.password],decoration:const InputDecoration(labelText:'Password')),
        const SizedBox(height:12),FilledButton(onPressed:busy||!widget.session.enabled?null:()=>run(()async{
          if(!email.text.contains('@')||password.text.length<6)throw StateError('Enter an email and a password with at least 6 characters.');
          await widget.session.email(email.text,password.text,signup:signup);password.clear();
        },success:signup?'Verification email sent. Verify your email and phone before booking.':null),child:Text(signup?'Create account':'Sign in')),
        Wrap(alignment:WrapAlignment.spaceBetween,children:[TextButton(onPressed:busy?null:()=>setState(()=>signup=!signup),child:Text(signup?'Already have an account?':'Create account')),TextButton(onPressed:busy||!widget.session.enabled?null:()=>run(()async{if(!email.text.contains('@'))throw StateError('Enter your email first.');await widget.session.resetPassword(email.text);},success:'If that email has an account, follow the reset instructions sent to it.'),child:const Text('Forgot password?'))]),
      ]else...[
        SelectableText(user.email??user.phoneNumber??user.uid),const SizedBox(height:12),
        FutureBuilder<Map<String,dynamic>>(future:profile,builder:(context,snapshot){
          if(snapshot.hasError)return Notice(friendlyError(snapshot.error!));
          if(!snapshot.hasData)return const LinearProgressIndicator();
          final p=snapshot.data!;
          return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Notice(p['needsPhone']==true?'Verify your phone number to enable booking.':'Phone verified.'),
            if(p['needsEmail']==true)const Notice('Please add and verify your email so the hotel can reach you.'),
          ]);
        }),
        TextField(controller:email,keyboardType:TextInputType.emailAddress,decoration:InputDecoration(labelText:'Email to verify',hintText:user.email)),
        TextButton(onPressed:busy?null:()=>run(()=>widget.session.verifyEmail(email.text.isEmpty?user.email??'':email.text),success:'Verification email sent. Follow the link, then tap Refresh profile.'),child:const Text('Send email verification')),
        OutlinedButton(onPressed:busy?null:()=>run(widget.session.reload,success:'Profile refreshed.'),child:const Text('Refresh profile')),
      ],
      if(user==null||user.phoneNumber==null)...[
        const SizedBox(height:24),Text(user==null?'Or use a phone number':'Verify your phone',style:Theme.of(context).textTheme.titleLarge),
        const SizedBox(height:12),TextField(controller:phone,keyboardType:TextInputType.phone,decoration:const InputDecoration(labelText:'Phone number',hintText:'+959...')),
        const SizedBox(height:12),OutlinedButton(onPressed:busy||cooldown>0||!widget.session.enabled?null:()=>run(sendOtp),child:Text(cooldown>0?'Resend in ${cooldown}s':'Send SMS code')),
        if(otpSent)...[const SizedBox(height:12),TextField(controller:otp,keyboardType:TextInputType.number,autofillHints:const[AutofillHints.oneTimeCode],decoration:const InputDecoration(labelText:'SMS verification code')),
          const SizedBox(height:12),FilledButton(onPressed:busy?null:()=>run(()=>widget.session.confirmPhone(otp.text),success:'Phone verified.'),child:const Text('Verify phone'))],
        const Text('SMS fees and availability depend on your operator. Verification links this number to your current account when signed in.'),
      ],
      if(user!=null)...[const SizedBox(height:24),OutlinedButton(onPressed:busy?null:()=>run(()async{await widget.session.signOut();password.clear();otp.clear();setState(()=>otpSent=false);}),child:const Text('Sign out'))],
      const SizedBox(height:28),const Divider(),const Text('WH mobile v0.2 · Payment integration pending'),
      const SizedBox(height:8),SelectableText(AppConfig.preview?'Connection: preview only':'Hotel API: ${widget.api.baseUrl}',style:Theme.of(context).textTheme.bodySmall),
    ]);
  });
}
