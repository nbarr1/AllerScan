# AllerScan for Android (Kotlin)

A native Android client for AllerScan, written in Kotlin with Jetpack Compose. It talks to the same
Express server as the web app (`server.ts` in the repository root), which keeps every third-party
API key. The app itself holds no keys.

This project is separate from the Capacitor shell in `../android`, which wraps the web app in a
WebView. The two use different application IDs (`com.allerscan.android` and `com.allerscan.app`),
so both can be installed on one device.

## Features

The app has four tabs:

- **Dashboard:** your personal 0-100 risk score, the tree, grass, weed and mold readings, the
  allergens that drove the score, air quality and weather, a pollen forecast where a live source
  provides one, and recommendations. A category with no reading shows "No reading" rather than 0,
  and estimates are labeled as estimates.
- **Scan:** take a photo with the camera app or choose one from the photo picker. The app
  downscales it to 1600 px, sends it to `/api/scan` and shows the identification, flagging a match
  with your saved allergens. When the server can't run its vision model, the app shows the server's
  error instead of a result.
- **My allergens:** the 21 built-in allergens with a mild, moderate or severe setting, plus your
  own custom triggers scored with their category's index.
- **Settings:** your location (city search, or this device's position rounded to about 1 km),
  reaction sensitivity, and the address of the AllerScan server.

Your profile is stored on the device with DataStore and is excluded from cloud backup and
device-to-device transfer.

## Project layout

```
android-native/
  core/   Plain Kotlin/JVM: API models, the allergen database and the OkHttp client, with unit tests.
          Builds without the Android SDK.
  app/    The Android app: Compose UI, ViewModel, DataStore storage, camera and location helpers.
```

## Build

Prerequisites:

- JDK 17 or later
- The Android SDK with platform 36 (Android Studio installs it), and `ANDROID_HOME` set or a
  `local.properties` file with `sdk.dir`

To build a debug APK, run the following from this directory:

```bash
./gradlew :app:assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`. Install it with
`adb install app/build/outputs/apk/debug/app-debug.apk`, or open this directory in Android Studio
and run the `app` configuration.

To run the unit tests, run `./gradlew :core:test`.

The "Android (Kotlin)" GitHub Actions workflow builds the same debug APK on every pull request that
changes this directory and uploads it as the `allerscan-debug-apk` artifact.

## Connect to a server

By default the app uses `http://10.0.2.2:3000`, which is the host machine as seen from the Android
emulator, so `npm run dev` in the repository root works with an emulator without further setup.

For a physical device, use an HTTPS deployment of the server. You can change the address in the
app's Settings tab, or build it in as the default:

```bash
./gradlew :app:assembleDebug -Pallerscan.baseUrl=https://allerscan.example.com
```

Plain HTTP is allowed only for `10.0.2.2`, `localhost` and `127.0.0.1` (see
`app/src/main/res/xml/network_security_config.xml`).

## Release builds

`./gradlew :app:assembleRelease` produces an unsigned, minified APK. To install it, or to publish
it, sign it with your own key, for example by adding a `signingConfigs` block to
`app/build.gradle.kts` that reads the keystore path and passwords from environment variables.
Keep keystores out of the repository; `.gitignore` excludes `*.jks` and `*.keystore`.

## Not a medical device

AllerScan is for personal environmental tracking only. It doesn't diagnose or treat allergies.
