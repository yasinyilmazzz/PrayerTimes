# CardTracker

**CardTracker**, **Capacitor**, **React** ve **TypeScript** kullanarak geliştirilmiş modern, çapraz‑platform bir mobil uygulamadır. Kullanıcıların kredi kartı harcamalarını güzel ve duyarlı bir arayüzde takip edip yönetmelerine olanak tanır. Tek bir kod tabanı ile iOS, Android ve web üzerinde çalışır.

---

## 📖 Genel Bakış

- **Tek veri kaynağı**: Tüm veriler yerel olarak IndexedDB / SQLite içinde tutulur, daha sonra bir back‑end ile senkronize edilebilir.
- **Şık UI**: Modern CSS, Google Fontları ve ince mikro‑animasyonlar sayesinde premium bir görünüm sunar.
- **Çapraz‑platform**: Capacitor sayesinde aynı web kodu Android ve iOS'ta native olarak çalışır.
- **Genişletilebilir**: Modüler React / TypeScript mimarisi sayesinde yeni özellikler (bildirimler, analitik vb.) eklemek kolaydır.

---

## 🛠️ Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| UI     | React, TypeScript, TSX, saf CSS |
| Native köprü | Capacitor 4 |
| Android derleme | Android Studio, Gradle |
| Paket yöneticisi | npm |
| Derleme aracı | Vite (`npm run dev` / `npm run build`) |

---

## 🚀 Başlangıç

### Gereksinimler

1. **Node.js** (v18 veya üzeri) ve **npm** – [indir](https://nodejs.org/)
2. **Java Development Kit** (JDK 11 veya daha yeni) – Android derlemeleri için gerekli
3. **Android Studio** ve Android SDK + komut satırı araçları
4. **Capacitor CLI** – global veya proje bağımlılığı olarak (`npm i -D @capacitor/cli`)
5. Fiziksel bir Android cihaz **veya** Android emulatorü

### Depoyu klonlayın

```bash
git clone https://github.com/yourusername/CardTracker.git
cd CardTracker
```

### JavaScript bağımlılıklarını kurun

```bash
npm ci   # package‑lock.json'a göre deterministik kurulum
```

### Web varlıklarını (dist) oluşturun

```bash
npm run build   # `dist/` klasörünü üretir
```

### Android platformunu ekleyin (ilk kez)

```bash
npx cap add android
```

### Capacitor varlıklarını senkronize edin

```bash
npx cap sync android
```

---

## 📦 Android APK Oluşturma

### Android Studio ile açın (önerilen)

```bash
npx cap open android
```

Android Studio `android/` klasörünü açar. Buradan:

- **Run** butonuyla bağlı cihaz veya emulator üzerinde uygulamayı çalıştırabilirsiniz.
- **Build > Generate Signed Bundle / APK…** menüsü ile imzalı bir release APK oluşturabilirsiniz.

### Komut satırından Gradle ile derleme

CLI tercih edenler için debug APK üretimi ve cihaz üzerine kurulum:

```bash
cd android    # oluşturulmuş Android projesi
./gradlew assembleDebug   # `app/build/outputs/apk/debug/app-debug.apk` oluşturur
./gradlew installDebug    # USB hata ayıklama açık olan cihaza kurar
```

**Release** sürümü (keystore gerekir):

```bash
./gradlew assembleRelease   # `app-release-unsigned.apk` üretir
# Keystore ile imzalama
jarsigner -keystore path/to/keystore.jks -storepass <store-pass> -keypass <key-pass> \
    app/build/outputs/apk/release/app-release-unsigned.apk <alias>
# (İsteğe bağlı) APK’yı hizalama
zipalign -v 4 app-release-unsigned.apk CardTracker.apk
```

### Fiziksel cihaza kurulum

1. Cihazda **USB hata ayıklama**yı etkinleştirin (Ayarlar → Geliştirici seçenekleri).
2. USB ile bağlayın.
3. Yukarıdaki `./gradlew installDebug` komutunu çalıştırın.

Uygulama cihazın uygulama çekmecesinde görünecektir.
İşte bu projeyi bir APK'ya dönüştürmek için izlemeniz gereken adımlar:
1. Capacitor'ı Projeye Ekleyin
Terminalde şu komutları sırasıyla çalıştırın:
# Capacitor çekirdek kütüphanelerini yükleyin
npm install @capacitor/core @capacitor/cli

# Capacitor'ı başlatın (Proje ismi ve paket kimliği soracaktır)
npx cap init
2. Android Platformunu Ekleyin
# Android paketini yükleyin
npm install @capacitor/android

# Android klasörünü oluşturun
npx cap add android
3. Projeyi Derleyin ve Android'e Aktarın
Her APK almak istediğinizde önce web projesini build etmeli, sonra bu build'i Android klasörüne kopyalamalısınız:
# React projesini build edin (dist klasörü oluşur)
npm run build

# Build dosyalarını Android projesine kopyalayın
npx cap copy android
4. APK Üretme (Android Studio ile)
Capacitor projenizi hazırladıktan sonra:
1.
npx cap open android komutunu çalıştırın. Bu, projenin Android kısmını Android Studio'da açacaktır.
2.
Android Studio açıldıktan sonra üst menüden Build > Build Bundle(s) / APK(s) > Build APK(s) seçeneğine tıklayın.
3.
İşlem bittiğinde sağ altta çıkan bildirimdeki "locate" bağlantısına tıklayarak APK dosyanıza ulaşabilirsiniz.
Not: APK üretebilmek için bilgisayarınızda Android SDK'nın kurulu olması gerekir. Android Studio içinden bu projeyi açtığınızda eksik bileşenler varsa IDE sizi uyaracak ve yüklemenizi isteyecektir.


---

## 🧹 Temizleme

Oluşturulan native dosyaları silmek ve baştan başlamak için:

```bash
npx cap clean android   # Android platform klasörünü kaldırır
```

Ardından **Android platformunu ekleme** adımlarını tekrar izleyin.

---

## 📚 Ek Kaynaklar

- Capacitor Dokümantasyonu: https://capacitorjs.com/docs
- Android Build Rehberi: https://developer.android.com/studio/build
- Vite + React Kılavuzu: https://vitejs.dev/guide/

---

## 🙋‍♀️ Katkıda Bulunma

Sorun bildirmek veya pull request göndermekten çekinmeyin. Lütfen mevcut kod stiline uyun ve `npm run lint` komutunu çalıştırarak hatasız gönderim yapın.

---

## 📄 Lisans

Bu proje MIT Lisansı altında lisanslanmıştır – detaylar `LICENSE` dosyasında bulunabilir.
