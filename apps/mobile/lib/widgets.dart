import 'package:flutter/material.dart';
import 'models.dart';

const forest = Color(0xff244939);
const paper = Color(0xfffaf9f5);

class Notice extends StatelessWidget {
  final String text;
  const Notice(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(16),
    margin: const EdgeInsets.symmetric(vertical: 12),
    decoration: BoxDecoration(
      color: const Color(0xffe8ede5),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(text),
  );
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title, message;
  final Widget? action;
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });
  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 56, color: forest),
          const SizedBox(height: 20),
          Text(
            title,
            style: Theme.of(context).textTheme.headlineSmall,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          if (action != null)
            Padding(padding: const EdgeInsets.only(top: 20), child: action),
        ],
      ),
    ),
  );
}

class RoomArt extends StatelessWidget {
  final Room room;
  final double height;
  const RoomArt(this.room, {super.key, this.height = 180});
  @override
  Widget build(BuildContext context) => Container(
    height: height,
    width: double.infinity,
    decoration: BoxDecoration(
      gradient: LinearGradient(
        colors: room.id.isOdd
            ? [const Color(0xffded5c1), const Color(0xffa8b49e)]
            : [const Color(0xffbecab5), const Color(0xffe7d5b6)],
      ),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Stack(
      children: [
        const Positioned(
          top: 20,
          left: 20,
          child: Text(
            'WH COLLECTION',
            style: TextStyle(letterSpacing: 3, fontSize: 10),
          ),
        ),
        const Center(
          child: Icon(Icons.bed_rounded, size: 110, color: Color(0xfffaf7ec)),
        ),
        Positioned(
          bottom: 16,
          left: 20,
          child: Text(
            room.name,
            style: const TextStyle(
              fontFamily: 'serif',
              fontSize: 24,
              color: forest,
            ),
          ),
        ),
      ],
    ),
  );
}

void showError(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message), duration: const Duration(seconds: 6)),
  );
}
