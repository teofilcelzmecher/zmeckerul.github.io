# Budgie for Android

Budgie's Android app, kept apart from the website: its own folder, its own build, its own version number. Inside
it are Budgie's own screens (built from `nook/`, the same as the website, but without ads), and around them a thin
Android layer (`native/native.js`, `native/native.css`) that the website never loads:

| | |
|---|---|
| Haptics | The app's buzzes become Android's haptic taps (light, medium, heavy), and long ones real vibrations. Settings → haptics off still turns them off |
| Notifications | Messages, group messages, calls and the inbox, through Firebase Cloud Messaging, in three channels people can silence one by one (Messages, Calls, Replies and more). The app asks first, in words, once someone has signed in. Tapping one opens its chat or post |
| Back button | Closes a menu, then a dialog, then the full-screen call (the call carries on), then goes back, then leaves |
| System bars | Edge to edge, with icons that suit the app's colours |
| Share, links | Android's share sheet; shared and copied links read budgiesocial.com; other sites open in a browser tab over the app |

It's made with [Capacitor](https://capacitorjs.com) 8. Package: `com.budgiesocial.app`. Android 7 (API 24) and newer.

## What's where

| | |
|---|---|
| `native/` | The Android layer |
| `tools/build-www.py` | Builds the app's screens into `www/` (`npm run www`) |
| `tools/make-icons.js` | Draws the launcher icons, notification icon, splash screens and the Play Store's icon and feature graphic |
| `android/` | The Android project (Android Studio can open it) |
| `store/` | For the Play Store: icon, feature graphic, screenshots, and [listing.md](store/listing.md) (texts and answers) |
| `../../.github/workflows/android.yml` | Builds and signs the app on GitHub |

Never in the repository (`.gitignore` keeps them out): the upload key (`*.jks`), its passwords
(`android/keystore.properties`) and Firebase's file for the app (`android/app/google-services.json`).

## Building it on GitHub (no computer needed)

Every push that changes the app (or Budgie's screens) builds it on GitHub. To set it up once, in the repository on
github.com: **Settings → Secrets and variables → Actions → New repository secret**, and add:

| Secret | What goes in it |
|---|---|
| `BUDGIE_KEYSTORE_BASE64` | The whole contents of `BUDGIE_KEYSTORE_BASE64.txt` (the upload key, written as text) |
| `BUDGIE_KEYSTORE_PASSWORD` | The contents of `BUDGIE_KEYSTORE_PASSWORD.txt` |
| `GOOGLE_SERVICES_JSON` | The whole contents of `google-services.json` from Firebase (for notifications) |

Then: **Actions → Android app → the newest run → Artifacts** has `budgie-android-N`, a zip with
`budgie-1.1.0-N.aab` (for Google Play) and `budgie-1.1.0-N.apk` (to install on an Android phone and try). N goes up
with every run, and Google Play needs it to (its "version code").

**Keep the upload key and its password somewhere safe** (a password manager, or iCloud Drive and a note). Every
update to Budgie on Google Play has to be signed with it. If it's ever lost or leaked, Google can reset it (Play
Console → Test and release → App integrity), because Google Play keeps the app's real signing key itself.

## Building it on a computer

Needs Node 22, JDK 21, Python 3 and the Android SDK (Android Studio brings the last two).

```sh
cd apps/android
npm ci
npm run sync                      # builds www/ and copies it into the Android project
cd android && ./gradlew assembleDebug    # app/build/outputs/apk/debug/app-debug.apk
```

For a signed release, make `android/keystore.properties`:

```properties
storeFile=/full/path/to/budgie-upload.jks
storePassword=…
keyAlias=budgie-upload
keyPassword=…
```

then `./gradlew bundleRelease`. Set `BUDGIE_VERSION_CODE` to a number bigger than the last upload's.

## A new version

1. Change `version` in `package.json` and `versionName` in `android/app/build.gradle`.
2. Push. GitHub builds it.
3. Download the `.aab` and upload it in Play Console (a new release in a testing track, then production).

Budgie's screens are inside the app, so a fix to the website reaches the app with its next Play Store update. The
server is the same for both: the app talks to it at its usual address, and the server lets
`https://app.budgiesocial.com` (the app's own address inside Android) in.
