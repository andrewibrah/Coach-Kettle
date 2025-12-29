# Running on Physical iOS Device

This project uses native modules (AsyncStorage), so you **cannot use Expo Go**. You need to build a development build and install it on your device.

## Prerequisites

1. **Apple Developer Account** (free account works for development)
2. **Xcode** installed on your Mac
3. **iPhone/iPad** connected via USB
4. **Device trusted** - unlock your device and tap "Trust This Computer" when prompted

## Steps

### 1. Start Backend and Metro Bundler

```bash
./build.sh
```

Or manually:
```bash
# Terminal 1: Backend
cd backend
source ../.venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Metro Bundler
npm start -- --reset-cache
```

### 2. Build and Install on Device

```bash
# Make sure your iPhone is connected via USB and unlocked
npx expo run:ios --device
```

This will:
- Build the app for your physical device
- Install it on your iPhone
- Launch it automatically

### 3. Configure Network Access

Since your backend runs on `localhost:8000`, you need to update the API URL for your device:

**Option A: Use your Mac's IP address**

1. Find your Mac's local IP:
   ```bash
   ipconfig getifaddr en0
   # or
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

2. Update `lib/api.ts`:
   ```typescript
   const API_BASE = "http://YOUR_MAC_IP:8000";
   // Example: "http://192.168.1.100:8000"
   ```

3. Make sure your Mac and iPhone are on the same Wi-Fi network

**Option B: Use ngrok or similar tunnel**

```bash
# Install ngrok
brew install ngrok

# Create tunnel to your backend
ngrok http 8000

# Use the ngrok URL in lib/api.ts
# Example: "https://abc123.ngrok.io"
```

## Troubleshooting

- **"No devices found"**: Make sure your device is connected via USB and unlocked
- **"Code signing error"**: You may need to configure your Apple Developer account in Xcode
- **"Cannot connect to backend"**: Check that both devices are on the same Wi-Fi network and update the API URL

