#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v flutter >/dev/null || { echo "Install Flutter SDK 3.41.7 first."; exit 1; }
if [[ ! -d apps/mobile/android || ! -d apps/mobile/ios ]]; then
  mobile_backup="$(mktemp -d)"
  trap 'rm -rf "$mobile_backup"' EXIT
  cp -R apps/mobile/lib apps/mobile/test "$mobile_backup/"
  cp apps/mobile/pubspec.yaml apps/mobile/analysis_options.yaml "$mobile_backup/"
  flutter create --no-pub --org com.whhotel --project-name wh_mobile --platforms android,ios apps/mobile
  cp -R "$mobile_backup/lib/." apps/mobile/lib/
  cp -R "$mobile_backup/test/." apps/mobile/test/
  cp "$mobile_backup/pubspec.yaml" "$mobile_backup/analysis_options.yaml" apps/mobile/
fi
python3 scripts/configure-mobile.py
cd apps/mobile
flutter pub get
