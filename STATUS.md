# G-code Timelapse -- Proje Durum Raporu

**Tarih:** 30 Mart 2026
**Versiyon:** 2.0.0
**APK:** https://expo.dev/artifacts/eas/fF3zVYXEbWkpFmdAFajvr8.apk

---

## Yapilacaklar

### 1. EAS Build ile test
- [ ] `eas build --profile development --platform android` ile yeni APK olustur
- [ ] Native video encoder modulunun duzgun derlenmesini dogrula
- [ ] Video olusturma + oynatma testleri yap

### 2. Arka Plan Calisma
- [ ] `expo-task-manager` ile background task register etme
- [ ] WebSocket baglantisinin arka planda kesilmesini onleme (Android doze mode)
- [ ] Development build ile arka plan testi

### 3. Diger
- [ ] OctoPrint icin yazicidan dosya listeleme (yerelden yazdirma eklendi)
- [ ] Timelapse isimlendirme (kullanici tanimli isim)
- [ ] Uygulama ikonu ve splash screen tasarimi

---

## Son Guncelleme: Gercek MP4 Video Uretimi

**Custom native Expo modulu yazildi: `modules/expo-frame-encoder/`**

Expo icinde kalarak, FFmpeg kullanmadan, platform native API'leri ile gercek H.264 MP4 video uretimi eklendi:

- **Android:** `MediaCodec` + `MediaMuxer` ile JPG frame'lerden H.264 encode (NV12/I420 otomatik secim)
- **iOS:** `AVAssetWriter` + `AVAssetWriterInputPixelBufferAdaptor` ile ayni is
- **JS:** `encodeFramesToVideo(dir, fps, output)` fonksiyonu export edildi
- **Fallback:** Native modul yoksa (Expo Go) otomatik slideshow manifest'e geri doner

**Guncellenen dosyalar:**
- `videoGenerator.ts` -- Oncelikle native encode dener, basarisiz olursa slideshow olusturur
- `gallery.tsx` -- MP4 icin `expo-av` Video player, slideshow icin eski animasyonlu oynatici
- MP4 videolari paylasilabilir (share butonu eklendi)
- Video listesinde MP4/Slideshow etiketi ve dosya boyutu gosterilir

**NOT:** Native modul icerdigi icin yeni bir EAS Build gerekiyor. Mevcut APK sadece slideshow destekler.

---

## Tamamlanan Ozellikler

### Baglanti Ekrani
- Yazici URL + API Key girisi, otomatik tip algilama (Moonraker / OctoPrint)
- Baglanti testi + firmware bilgisi
- Fotograf cekme URL + opsiyonel MJPEG stream URL
- Canli kamera onizleme (stream varsa)

### Timelapse Ekrani
- Hizli Mod (API dinleyerek) + Temiz Mod (G-code modify edilmis)
- Katman degisiminde otomatik fotograf cekimi
- Canli katman gostergesi, baski ilerleme cubugu, son fotograflar
- Android foreground notification (katman + fotograf sayisi guncellenir)
- Baski tamamlandiginda otomatik durdurma

### G-code Modifier Ekrani
- **Yerel dosyadan yazdir:** DocumentPicker ile .gcode/.g secimi, onay sonrasi Moonraker'da
  `upload` + `POST /printer/print/start`, OctoPrint'te `POST /api/files/local?print=true`
- Telefondan veya yazicidan (Moonraker) dosya secme (modifier icin)
- G-code analizi (katman, yukseklik, dilimleyici)
- Park ayarlari (X, Y, Z Hop, Bekleme, Retract)
- Modify sonrasi paylasma veya yaziciya yukleme

### Galeri Ekrani
- Timelapse listesi + detay ekrani
- Fotograf grid, FPS secimi (10/15/24/30/60), tahmini sure
- **Gercek MP4 video olusturma** (native encoder ile)
- **expo-av Video player** ile MP4 oynatma (native controls)
- JS slideshow oynatici (fallback)
- MP4 video paylasma, silme
- Birden fazla video olusturma destegi

### Video Encoder (Native Module)
- `modules/expo-frame-encoder/` -- Local Expo module
- Android: MediaCodec + MediaMuxer (H.264, donanim hizlandirmali)
- iOS: AVAssetWriter (H.264, donanim hizlandirmali)
- Otomatik renk formati secimi (NV12 / I420)
- FFmpeg yok -- APK boyutu etkilenmez

### Servisler
- `moonraker.ts` -- WebSocket + REST polling + Z-axis fallback + dosya API + `startPrintJob`,
  `uploadGcodeFileDetailed`
- `octoprint.ts` -- REST API polling + `uploadGcodeFileAndPrint` (yerel dosyadan baski)
- `camera.ts` -- IP kamera snapshot
- `videoGenerator.ts` -- Native MP4 encode + slideshow fallback

### Altyapi
- Expo SDK 54, Expo Router, Zustand, TypeScript
- Dark theme UI, EAS Build, Development Build APK hazir

---

## Dosya Yapisi

```
gcode_timelapse/
├── app/
│   ├── _layout.tsx
│   └── (tabs)/
│       ├── _layout.tsx              # Tab navigation (4 sekme)
│       ├── index.tsx                # Baglanti ekrani
│       ├── timelapse.tsx            # Timelapse baslatma/durdurma
│       ├── gcode.tsx                # G-code modifier + yazici dosyalari
│       └── gallery.tsx              # Galeri + video oynatici
├── modules/
│   └── expo-frame-encoder/          # Native video encoder modulu
│       ├── expo-module.config.json
│       ├── index.ts                 # JS bridge
│       ├── android/
│       │   └── .../ExpoFrameEncoderModule.kt  # MediaCodec encoder
│       └── ios/
│           └── ExpoFrameEncoderModule.swift    # AVAssetWriter encoder
├── src/
│   ├── components/
│   │   ├── CameraPreview.tsx
│   │   ├── ConnectionCard.tsx
│   │   ├── LayerIndicator.tsx
│   │   ├── PrintProgress.tsx
│   │   └── Slider.tsx
│   ├── services/
│   │   ├── moonraker.ts             # Moonraker WebSocket + REST + dosya API
│   │   ├── octoprint.ts             # OctoPrint REST API
│   │   ├── printer.ts               # Adapter pattern
│   │   ├── camera.ts                # IP kamera snapshot
│   │   └── videoGenerator.ts        # Native encode + slideshow fallback
│   ├── stores/
│   │   └── useTimelapseStore.ts     # Zustand global state
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       ├── gcodeModifier.ts
│       └── asyncStorage.ts
├── app.json
├── eas.json
├── package.json
├── tsconfig.json
├── .npmrc
└── .gitignore
```
