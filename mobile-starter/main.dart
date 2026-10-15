import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() => runApp(const WhApp());

class WhApp extends StatelessWidget {
  const WhApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'WH Hotel',
    theme: ThemeData(colorSchemeSeed: const Color(0xff244939), useMaterial3: true),
    home: const RoomsPage(),
  );
}

class RoomsPage extends StatefulWidget {
  const RoomsPage({super.key});
  @override
  State<RoomsPage> createState() => _RoomsPageState();
}

class _RoomsPageState extends State<RoomsPage> {
  late Future<List<dynamic>> rooms;
  @override
  void initState() { super.initState(); rooms = load(); }

  Future<List<dynamic>> load() async {
    const base = String.fromEnvironment('API_BASE_URL');
    if (!base.startsWith('https://')) {
      throw Exception('Configure API_BASE_URL with your HTTPS /api URL.');
    }
    final response = await http.get(Uri.parse('${base.replaceFirst(RegExp(r'/$'), '')}/rooms'))
      .timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) throw Exception('Unable to load rooms.');
    return jsonDecode(response.body) as List<dynamic>;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('WH · Hotel & Stays')),
    body: FutureBuilder<List<dynamic>>(
      future: rooms,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
            Padding(padding: const EdgeInsets.all(24), child: Text('${snapshot.error}')),
            FilledButton(onPressed: () => setState(() { rooms = load(); }), child: const Text('Retry')),
          ]));
        }
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        return ListView(padding: const EdgeInsets.all(20), children: [
          Text('Room to unwind.', style: Theme.of(context).textTheme.headlineLarge),
          const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Text(
            'Mobile starter: room browsing only. Authentication, booking and payment screens are not implemented yet.')),
          ...snapshot.data!.map((room) => Card(child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${room['name']}', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              Text('${room['description']}'),
              const SizedBox(height: 12),
              Text('${(int.parse('${room['nightly_amount_minor']}') / 100).toStringAsFixed(0)} MMK / night · demo'),
            ]),
          ))),
        ]);
      },
    ),
  );
}
