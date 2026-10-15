#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -d apps/mobile/android || -d apps/mobile/ios ]]; then
  echo "Mobile project exists. No files overwritten."
  exit 0
fi
mkdir -p apps/mobile/lib
flutter create --org com.whhotel --project-name wh_mobile --platforms android,ios apps/mobile
cp mobile-starter/main.dart apps/mobile/lib/main.dart
python3 - <<'PY'
from pathlib import Path
p = Path('apps/mobile/android/app/src/main/AndroidManifest.xml')
s = p.read_text()
if 'android.permission.INTERNET' not in s:
    pos = s.index('>') + 1
    s = s[:pos] + '\n    <uses-permission android:name="android.permission.INTERNET" />' + s[pos:]
    p.write_text(s)
PY
rm -f apps/mobile/test/widget_test.dart
cd apps/mobile
flutter pub add http
echo "Mobile starter created. Commit apps/mobile including pubspec.lock after verifying it."
