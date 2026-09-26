// Barcode scanner for nutrition logging.
//
// Emits a NORMALIZED GTIN-13 via `onScanned`. The caller does the lookup, so
// this component owns nothing but the camera, the permission state and the
// duplicate-scan guard.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/useThemeColor';
import { normalizeBarcode, SCANNABLE_BARCODE_TYPES } from '@/lib/barcode';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Receives a normalized 13-digit GTIN. */
  onScanned: (barcode: string) => void;
  /** Shown while the caller resolves the code; keeps the sheet up and locked. */
  busy?: boolean;
}

export function BarcodeScannerModal({ visible, onClose, onScanned, busy = false }: Props) {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const inputBg = useThemeColor({}, 'inputBackground');
  const dangerColor = useThemeColor({}, 'danger');
  const cameraOverlay = useThemeColor({}, 'cameraOverlay');
  const cameraOverlayText = useThemeColor({}, 'cameraOverlayText');
  const cameraScrim = useThemeColor({}, 'cameraScrim');

  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  // CRITICAL: onBarcodeScanned fires many times per second while a code is in
  // frame. This guard must be a ref set SYNCHRONOUSLY at the top of the handler
  // — a useState setter has not committed by the next camera frame, which
  // produces 3-8 duplicate lookups (and duplicate log entries) per scan.
  const lockedRef = useRef(false);

  // Re-arm whenever the sheet is reopened.
  useEffect(() => {
    if (visible) {
      lockedRef.current = false;
      setScanError(null);
      setTorch(false);
      setManualCode('');
      setShowManual(false);
    }
  }, [visible]);

  const emit = useCallback((code: string, symbology?: string) => {
    const normalized = normalizeBarcode(code, symbology);
    if (!normalized) {
      lockedRef.current = false; // let them try again
      setScanError("That barcode isn't a recognizable product code. Try again or type it in.");
      return;
    }
    setScanError(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onScanned(normalized);
  }, [onScanned]);

  const handleBarcodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (lockedRef.current) return;
    lockedRef.current = true;          // synchronous, before any async work
    emit(result.data, result.type);
  }, [emit]);

  const handleManualSubmit = useCallback(() => {
    // Check the lock FIRST and say something. Ordering it after the length
    // check made a locked "Look up" tap a silent no-op.
    if (lockedRef.current) {
      setScanError('Already looking that one up — one moment.');
      return;
    }
    const digits = manualCode.replace(/\D/g, '');
    if (digits.length < 8) {
      setScanError('Enter at least 8 digits from under the barcode.');
      return;
    }
    lockedRef.current = true;
    emit(digits);
  }, [manualCode, emit]);

  const granted = permission?.granted === true;
  // Denied without the ability to re-prompt ⇒ only Settings can fix it.
  const blocked = permission != null && !permission.granted && !permission.canAskAgain;
  const cameraUsable = Platform.OS !== 'web' && granted;

  const renderBody = () => {
    if (permission == null) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      );
    }

    if (Platform.OS === 'web') {
      return (
        <View style={styles.centered}>
          <ThemedText style={{ textAlign: 'center', marginBottom: 12 }}>
            Barcode scanning needs the mobile app. You can still enter the number below.
          </ThemedText>
        </View>
      );
    }

    if (!granted) {
      return (
        <View style={styles.centered}>
          <IconSymbol name="camera.fill" size={40} color={placeholder} />
          <ThemedText type="subtitle" style={{ marginTop: 12, textAlign: 'center' }}>
            Camera access needed
          </ThemedText>
          <ThemedText style={{ color: placeholder, textAlign: 'center', marginTop: 6, marginBottom: 16 }}>
            Coach Kettle uses the camera only to read the barcode. Nothing is recorded or uploaded.
          </ThemedText>
          <Pressable
            onPress={() => { void (blocked ? Linking.openSettings() : requestPermission()); }}
            accessibilityRole="button"
            accessibilityLabel={blocked ? 'Open Settings' : 'Allow camera access'}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: tint },
              pressed && { opacity: 0.7 },
            ]}
          >
            <ThemedText style={{ color: onTint, fontWeight: '700' }}>
              {blocked ? 'Open Settings' : 'Allow camera'}
            </ThemedText>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={[styles.cameraWrap, { backgroundColor: cameraOverlay }]}>
        <CameraView
          // `active` releases the camera when the sheet is hidden.
          active={visible && !busy}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          // Audio is never used; asking for it would add a mic permission prompt.
          mute
          barcodeScannerSettings={{ barcodeTypes: [...SCANNABLE_BARCODE_TYPES] }}
          onBarcodeScanned={busy ? undefined : handleBarcodeScanned}
        />
        <View style={styles.reticle} pointerEvents="none">
          <View style={[styles.reticleBox, { borderColor: busy ? tint : cameraOverlayText }]} />
        </View>
        {busy && (
          <View style={[styles.busyOverlay, { backgroundColor: cameraScrim }]} pointerEvents="none">
            <ActivityIndicator color={cameraOverlayText} />
            <ThemedText style={{ color: cameraOverlayText, marginTop: 8, fontWeight: '600' }}>
              Looking up product…
            </ThemedText>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
            hitSlop={12}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          >
            <IconSymbol name="xmark" size={20} color={textColor} />
          </Pressable>
          <ThemedText type="subtitle">Scan barcode</ThemedText>
          {cameraUsable ? (
            <Pressable
              onPress={() => setTorch((t) => !t)}
              accessibilityRole="button"
              accessibilityLabel={torch ? 'Turn flashlight off' : 'Turn flashlight on'}
              accessibilityState={{ selected: torch }}
              hitSlop={12}
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <IconSymbol name={torch ? 'bolt.fill' : 'bolt.slash'} size={20} color={torch ? tint : textColor} />
            </Pressable>
          ) : (
            <View style={{ width: 20 }} />
          )}
        </View>

        {renderBody()}

        <View style={[styles.footer, { backgroundColor: cardBackground, paddingBottom: insets.bottom + 16 }]}>
          {scanError && (
            <ThemedText style={{ color: dangerColor, fontSize: 13, marginBottom: 10, textAlign: 'center' }}>
              {scanError}
            </ThemedText>
          )}

          {cameraUsable && !showManual && (
            <ThemedText style={{ color: placeholder, fontSize: 13, textAlign: 'center', marginBottom: 10 }}>
              Point at the barcode on the package.
            </ThemedText>
          )}

          {showManual || !cameraUsable ? (
            <View>
              <ThemedText style={{ fontWeight: '600', marginBottom: 6 }}>
                Enter the barcode number
              </ThemedText>
              <TextInput
                value={manualCode}
                onChangeText={(value) => { setManualCode(value); setScanError(null); }}
                keyboardType="number-pad"
                placeholder="e.g. 038000138416"
                placeholderTextColor={placeholder}
                maxLength={14}
                editable={!busy}
                accessibilityLabel="Barcode number"
                style={[
                  styles.input,
                  { backgroundColor: inputBg, color: textColor, borderColor: border },
                ]}
              />
              <Pressable
                onPress={handleManualSubmit}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Look up barcode"
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: tint, marginTop: 10, opacity: busy ? 0.6 : 1 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                {busy
                  ? <ActivityIndicator color={onTint} />
                  : <ThemedText style={{ color: onTint, fontWeight: '700' }}>Look up</ThemedText>}
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => { setShowManual(true); setScanError(null); }}
              accessibilityRole="button"
              accessibilityLabel="Enter the barcode number instead"
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <ThemedText style={{ fontWeight: '600' }}>Type the number instead</ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cameraWrap: { flex: 1, overflow: 'hidden' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  reticle: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  reticleBox: {
    width: '75%',
    aspectRatio: 1.6,
    borderWidth: 2,
    borderRadius: 12,
    opacity: 0.85,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { paddingHorizontal: 16, paddingTop: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  primaryBtn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  secondaryBtn: {
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
});
