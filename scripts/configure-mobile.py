"""Apply WH native defaults to generated Flutter platform projects."""
import os
import plistlib
import re
from pathlib import Path
root = Path(__file__).resolve().parents[1] / 'apps/mobile'
manifest = root / 'android/app/src/main/AndroidManifest.xml'
text = manifest.read_text()
if 'android.permission.INTERNET' not in text:
    pos = text.index('>') + 1
    text = text[:pos] + '\n    <uses-permission android:name="android.permission.INTERNET" />' + text[pos:]
text = text.replace('android:label="wh_mobile"', 'android:label="WH Hotel"').replace('android:taskAffinity=""', '')
manifest.write_text(text)
gradle = root / 'android/app/build.gradle.kts'
if gradle.exists():
    gradle.write_text(gradle.read_text().replace('minSdk = flutter.minSdkVersion', 'minSdk = 24'))
plist = root / 'ios/Runner/Info.plist'
with plist.open('rb') as f:
    info = plistlib.load(f)
info['CFBundleDisplayName'] = 'WH Hotel'
info['CFBundleName'] = 'WH Hotel'
scheme = os.environ.get('GOOGLE_IOS_REVERSED_CLIENT_ID', '')
if scheme:
    items = info.setdefault('CFBundleURLTypes', [])
    if not any(scheme in item.get('CFBundleURLSchemes', []) for item in items):
        items.append({'CFBundleTypeRole': 'Editor', 'CFBundleURLSchemes': [scheme]})
with plist.open('wb') as f:
    plistlib.dump(info, f)
project = root / 'ios/Runner.xcodeproj/project.pbxproj'
text = re.sub(r'IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;', 'IPHONEOS_DEPLOYMENT_TARGET = 15.0;', project.read_text())
project.write_text(text)
podfile = root / 'ios/Podfile'
if podfile.exists():
    text = re.sub(r"#?\s*platform :ios, '[^']+'", "platform :ios, '15.0'", podfile.read_text())
    podfile.write_text(text)
