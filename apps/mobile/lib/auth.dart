import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'config.dart';

class WhSession extends ChangeNotifier {
  final bool enabled;
  final String? initializationError;
  StreamSubscription<User?>? _subscription;
  Future<void>? _googleInit;
  String? _verificationId, _linkingUid;
  bool _otpInProgress = false;
  WhSession({this.enabled = false, this.initializationError}) {
    if (enabled) _subscription = FirebaseAuth.instance.userChanges().listen((_) => notifyListeners());
  }
  User? get user => enabled ? FirebaseAuth.instance.currentUser : null;
  Future<String?> token() async => user?.getIdToken();
  void _require() {
    if (!enabled) throw StateError(initializationError ?? 'Firebase is not configured in this build. See apps/mobile/README.md.');
  }
  Future<void> google() async {
    _require();
    if (AppConfig.googleServerClientId.isEmpty) throw StateError('Configure GOOGLE_SERVER_CLIENT_ID first.');
    _googleInit ??= GoogleSignIn.instance.initialize(
      serverClientId: AppConfig.googleServerClientId,
      clientId: defaultTargetPlatform == TargetPlatform.iOS && AppConfig.googleIosClientId.isNotEmpty ? AppConfig.googleIosClientId : null,
    );
    await _googleInit;
    final account = await GoogleSignIn.instance.authenticate();
    final idToken = account.authentication.idToken;
    if (idToken == null) throw StateError('Google did not return an ID token.');
    final credential = GoogleAuthProvider.credential(idToken:idToken);
    if (user != null) { await user!.linkWithCredential(credential); }
    else { await FirebaseAuth.instance.signInWithCredential(credential); }
  }
  Future<void> apple() async {
    _require();
    final provider = AppleAuthProvider()..addScope('email')..addScope('name');
    if (user != null) { await user!.linkWithProvider(provider); }
    else { await FirebaseAuth.instance.signInWithProvider(provider); }
  }
  Future<void> email(String email,String password,{bool signup=false}) async {
    _require();
    if (signup) {
      final result = await FirebaseAuth.instance.createUserWithEmailAndPassword(email:email.trim(),password:password);
      await result.user!.sendEmailVerification();
    } else {
      await FirebaseAuth.instance.signInWithEmailAndPassword(email:email.trim(),password:password);
    }
  }
  Future<void> resetPassword(String email) async {
    _require();
    await FirebaseAuth.instance.sendPasswordResetEmail(email:email.trim());
  }
  Future<void> verifyEmail(String email) async {
    _require();
    if (user == null) throw StateError('Sign in first.');
    if (email.trim() == user!.email) { await user!.sendEmailVerification(); }
    else { await user!.verifyBeforeUpdateEmail(email.trim()); }
  }
  Future<void> reload() async {
    _require();
    await user?.reload();
    await user?.getIdToken(true);
    notifyListeners();
  }
  Future<void> signOut() async {
    if (!enabled) return;
    _verificationId = null;
    _linkingUid = null;
    await FirebaseAuth.instance.signOut();
    if (_googleInit != null) await GoogleSignIn.instance.signOut();
  }
  Future<void> sendPhone(String phone,{required VoidCallback codeSent,required VoidCallback verified,
    required void Function(Object) failed}) async {
    _require();
    if (!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(phone)) throw StateError('Use international format, for example +959...');
    if (_otpInProgress) throw StateError('Please wait for the current phone request.');
    _otpInProgress = true;
    _linkingUid = user?.uid;
    _verificationId = null;
    try {
      await FirebaseAuth.instance.verifyPhoneNumber(
        phoneNumber:phone, timeout:const Duration(seconds:60),
        verificationCompleted:(credential) async {
          try { await _finishPhone(credential); verified(); }
          catch (e) { failed(e); }
          finally { _otpInProgress=false; }
        },
        verificationFailed:(error) { _otpInProgress=false; failed(error); },
        codeSent:(id,_) { _verificationId=id; _otpInProgress=false; codeSent(); },
        codeAutoRetrievalTimeout:(id) { _verificationId=id; _otpInProgress=false; },
      );
    } catch (_) { _otpInProgress=false; rethrow; }
  }
  Future<void> confirmPhone(String code) async {
    if (_verificationId == null) throw StateError('Request a fresh SMS code first.');
    await _finishPhone(PhoneAuthProvider.credential(verificationId:_verificationId!,smsCode:code.trim()));
  }
  Future<void> _finishPhone(PhoneAuthCredential credential) async {
    if (_linkingUid != user?.uid) throw StateError('Your account changed. Request a new code.');
    if (_linkingUid != null) { await user!.linkWithCredential(credential); }
    else { await FirebaseAuth.instance.signInWithCredential(credential); }
    _verificationId=null;
    await user?.getIdToken(true);
    notifyListeners();
  }
  @override
  void dispose() { _subscription?.cancel(); super.dispose(); }
}

String friendlyError(Object e) {
  if (e is FirebaseAuthException) {
    return switch (e.code) {
      'credential-already-in-use' || 'email-already-in-use' || 'account-exists-with-different-credential' =>
        'That identity belongs to another account. Sign in to that account; accounts are never merged automatically.',
      'requires-recent-login' => 'Please sign out and sign in again, then retry.',
      'invalid-verification-code' => 'The SMS code is incorrect.',
      'session-expired' => 'The SMS code expired. Request another code.',
      'too-many-requests' => 'Too many attempts. Please wait before trying again.',
      'invalid-credential' || 'wrong-password' || 'user-not-found' => 'The sign-in details are incorrect.',
      'network-request-failed' => 'Check your internet connection and try again.',
      _ => e.message ?? 'Authentication failed. Please try again.',
    };
  }
  return e.toString().replaceFirst('Bad state: ', '');
}
