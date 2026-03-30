# Printer Timelapse (Mobile App)

A mobile app that captures layer-based photos from an IP camera and turns your 3D prints into timelapses.

## Features

- **Moonraker + OctoPrint support** (Klipper / Fluidd / Mainsail + OctoPrint)
- **Auto-detect printer type** from the URL
- **Two capture modes**
  - **Quick Mode**: no G-code changes, listens to printer status
  - **Clean Mode**: use a modified G-code so the toolhead parks for clean frames
- **IP camera snapshots** via any HTTP image URL (example: `http://IP:8080/shot.jpg`)
- **G-code Modifier**: pick a file, configure park settings, generate a clean-mode file
- **Gallery**: view captured frames and generate videos at different FPS

## Install

```bash
cd gcode_timelapse
npm install
```

## Run

```bash
# Dev (Expo)
npx expo start

# Android
npx expo start --android

# iOS
npx expo start --ios
```

## Usage

### 1) Connect

1. In the **Connection** tab, enter your printer URL (example: `http://192.168.1.100`)
2. Enter your camera snapshot URL (example: `http://192.168.1.21:8080/shot.jpg`)
3. Test both connections

### 2) Start a timelapse

1. Go to the **Timelapse** tab
2. Choose a mode
   - **Quick Mode**: start immediately
   - **Clean Mode**: first generate a modified file in the **G-code** tab
3. Press **Start**
4. Start your print on the printer

### 3) Clean Mode (G-code Modifier)

1. Open the **G-code** tab
2. Select a `.gcode` / `.g` file
3. Configure park settings (X, Y, Z-hop, dwell)
4. Generate the modified file
5. Upload it to the printer and print it

### 4) Gallery

View completed timelapses, generate videos at different FPS, and share.

## Tech

| Bileşen | Teknoloji |
|---------|-----------|
| Framework | Expo SDK 54 + Expo Router |
| Dil | TypeScript |
| State | Zustand |
| Moonraker | WebSocket (real-time) |
| OctoPrint | REST API (polling) |
| Depolama | expo-file-system |

## Supported cameras

Any IP camera that returns an image via HTTP:
- IP Webcam (Android): `http://IP:8080/shot.jpg`
- ESP32-CAM: `http://IP/capture`
- Any other snapshot URL
