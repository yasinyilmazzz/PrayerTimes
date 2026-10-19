# CardTracker

**CardTracker** is a modern, cross‑platform mobile application built with **Capacitor**, **React** and **TypeScript** that lets users track and manage their credit‑card expenses in a beautiful, responsive UI. The app runs on iOS, Android, and the web from a single code‑base.

---

## 📖 Overview

- **Single source of truth**: All data is stored locally using IndexedDB / SQLite and can be synchronized with a backend later.
- **Beautiful UI**: Leveraging modern CSS, Google Fonts, and subtle micro‑animations for a premium feel.
- **Cross‑platform**: Powered by Capacitor, the same web code runs natively on Android and iOS.
- **Extensible**: Easy to add new features (e.g., notifications, analytics) thanks to a modular React / TypeScript architecture.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| UI    | React, TypeScript, TSX, CSS (vanilla) |
| Native bridge | Capacitor 4 |
| Android build | Android Studio, Gradle |
| Package manager | npm |
| Build tool | Vite (via `npm run dev`/`npm run build`) |

---

## 🚀 Getting Started

### Prerequisites

1. **Node.js** (>= 18) and **npm** – [download](https://nodejs.org/)
2. **Java Development Kit** (JDK 11 or newer) – required for Android builds
3. **Android Studio** with the Android SDK and command‑line tools installed
4. **Capacitor CLI** – installed globally or as a dev dependency (`npm i -D @capacitor/cli`)
5. A physical Android device **or** an Android emulator

### Clone the repository

```bash
git clone https://github.com/yourusername/CardTracker.git
cd CardTracker
```

### Install JavaScript dependencies

```bash
npm ci   # ensures a deterministic install based on package‑lock.json
```

### Build the web assets

```bash
npm run build   # creates a production‑ready `dist/` folder
```

### Add the Android platform (only needed once)

```bash
npx cap add android
```

### Sync Capacitor assets with the native project

```bash
npx cap sync android
```

---

## 📦 Building the Android APK

### Open the Android project in Android Studio (recommended)

```bash
npx cap open android
```

Android Studio will launch with the `android/` folder opened. From there you can:

- **Run** the app directly on a connected device or emulator (`Run ▶️` button).
- **Generate a signed release APK** via `Build > Generate Signed Bundle / APK…`.

### Build from the command line (Gradle)

If you prefer a pure CLI workflow, you can build and install the debug APK with Gradle:

```bash
cd android    # the generated Android project
./gradlew assembleDebug   # creates app-debug.apk under app/build/outputs/apk/debug/
./gradlew installDebug    # pushes it to a connected device (USB debugging must be enabled)
```

For a **release** build (you’ll need a keystore):

```bash
./gradlew assembleRelease   # outputs app-release-unsigned.apk
# Then sign it:
jarsigner -keystore path/to/keystore.jks -storepass <store-pass> -keypass <key-pass> \
    app/build/outputs/apk/release/app-release-unsigned.apk <alias>
# Align the APK (optional but recommended):
zipalign -v 4 app-release-unsigned.apk CardTracker.apk
```

### Deploy to a physical device

1. Enable **USB debugging** on the device (Settings → Developer options).
2. Connect the device via USB.
3. Run the install command shown above (`./gradlew installDebug`).

The app will appear in the device’s app drawer.

---

## 🧹 Clean Up

To remove generated native files and start fresh:

```bash
npx cap clean android   # removes the Android platform folder
```

Then repeat the **Add Android platform** steps.

---

## 📚 Further Reading

- Capacitor Documentation: https://capacitorjs.com/docs
- Android Build Guide: https://developer.android.com/studio/build
- Vite + React guide: https://vitejs.dev/guide/

---

## 🙋‍♀️ Contributing

Feel free to open issues or submit pull requests. Please follow the existing code style and run `npm run lint` before submitting.

---

## 📄 License

This project is licensed under the MIT License – see the `LICENSE` file for details.
