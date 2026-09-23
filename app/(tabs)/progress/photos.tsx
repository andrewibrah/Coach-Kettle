import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Toast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/contexts/AuthProvider';

import {
  fetchBodyPhotos,
  uploadAndRecordBodyPhoto,
  deleteBodyPhoto,
} from '@/lib/bodyMetrics';
import { todayISO } from '@/lib/workoutRules';
import type { BodyPhoto } from '@/types/body';

type Pose = 'front' | 'side' | 'back';
const POSES: Pose[] = ['front', 'side', 'back'];

export default function BodyPhotosScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const dangerColor = useThemeColor({}, 'danger');
  const dangerForeground = useThemeColor({}, 'dangerForeground');

  const { session } = useAuth();
  const userId = session?.user?.id ?? '';

  const { toast, showToast, hideToast } = useToast();
  const [photos, setPhotos] = useState<BodyPhoto[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pose, setPose] = useState<Pose>('front');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<BodyPhoto | null>(null);
  const [retrying, setRetrying] = useState(false);

  const mounted = useRef(false);
  // Guards retry/add-photo/delete loads (which all funnel through load())
  // from resolving out of order and clobbering a newer result.
  const loadSequence = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const list = await fetchBodyPhotos(180);
      if (!mounted.current || sequence !== loadSequence.current) return;
      setPhotos(list);
      setLoadState('ready');
      setLoadError(null);
    } catch (e: any) {
      if (!mounted.current || sequence !== loadSequence.current) return;
      console.warn('[photos] load failed', e);
      // Keep any previously loaded photos visible; only fall back to the
      // full error state when there is nothing on screen yet.
      setLoadError(e?.message ?? 'Could not load progress photos.');
      setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRetry = useCallback(async () => {
    setRetrying(true);
    await load();
    if (mounted.current) setRetrying(false);
  }, [load]);

  const onAddPhoto = useCallback(async () => {
    if (!userId) {
      showToast('Please sign in to add photos.', 'error');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast('Photo library access is required.', 'info');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      await uploadAndRecordBodyPhoto({
        userId,
        localUri: asset.uri,
        capturedDate: todayISO(),
        pose,
        width: asset.width,
        height: asset.height,
      });
      await load();
    } catch (e: any) {
      showToast(e?.message ?? 'Upload failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  }, [userId, pose, load, showToast]);

  const onDelete = useCallback((id: string) => {
    Alert.alert('Delete photo?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBodyPhoto(id);
            await load();
          } catch (e: any) {
            showToast(e?.message ?? 'Could not delete. Please try again.', 'error');
          }
        },
      },
    ]);
  }, [load, showToast]);

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}
      <ScreenHeader title="Progress photos" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* Pose selector */}
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={styles.cardTitle}>Pose</ThemedText>
          <View style={styles.poseRow}>
            {POSES.map((p) => {
              const active = pose === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPose(p)}
                  style={({ pressed }) => [
                    styles.poseBtn,
                    { borderColor: border },
                    active && { backgroundColor: tint, borderColor: tint },
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityLabel={p[0].toUpperCase() + p.slice(1)}
                  accessibilityState={{ selected: active }}
                >
                  <ThemedText
                    type="defaultSemiBold"
                    style={[styles.poseBtnText, active && { color: onTint }]}
                  >
                    {p[0].toUpperCase() + p.slice(1)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={onAddPhoto}
            disabled={uploading}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: tint },
              pressed && { opacity: 0.7 },
              uploading && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={uploading ? 'Uploading photo...' : 'Add progress photo'}
            accessibilityState={{ disabled: uploading }}
          >
            <ThemedText type="defaultSemiBold" style={[styles.addBtnText, { color: onTint }]}>
              {uploading ? 'Uploading…' : 'Add photo'}
            </ThemedText>
          </Pressable>
        </View>

        {/* Grid */}
        {loadState === 'error' && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={{ color: dangerColor }} accessibilityRole="alert">
              Couldn&apos;t load progress photos. Check your connection and try again.
            </ThemedText>
            <Pressable
              onPress={onRetry}
              disabled={retrying}
              style={({ pressed }) => [
                styles.retryBtn,
                { backgroundColor: tint },
                pressed && { opacity: 0.7 },
                retrying && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Retry loading progress photos"
              accessibilityState={{ disabled: retrying, busy: retrying }}
            >
              <ThemedText type="defaultSemiBold" style={{ color: onTint }}>{retrying ? 'Retrying…' : 'Retry'}</ThemedText>
            </Pressable>
          </View>
        )}
        {loadState === 'loading' && (
          <View style={[styles.card, styles.center]}>
            <ActivityIndicator />
          </View>
        )}
        {loadState === 'ready' && loadError && (
          <View style={[styles.card, { backgroundColor: dangerColor }]}>
            <ThemedText style={[styles.errorBannerText, { color: dangerForeground }]} accessibilityRole="alert">
              Couldn&apos;t refresh. Showing previously loaded photos.
            </ThemedText>
          </View>
        )}
        {loadState === 'ready' && photos.length === 0 ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={{ color: placeholder }}>No progress photos yet. Tap Add photo to start a comparison.</ThemedText>
          </View>
        ) : loadState === 'ready' ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <View style={styles.grid}>
              {photos.map((photo) => (
                <Pressable
                  key={photo.id}
                  onPress={() => setPreview(photo)}
                  onLongPress={() => onDelete(photo.id)}
                  style={({ pressed }) => [
                    styles.thumbWrap,
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="View progress photo"
                >
                  {photo.signed_url ? (
                    <Image source={{ uri: photo.signed_url }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: border }]}>
                      <ThemedText style={{ color: placeholder, fontSize: 11 }}>No URL</ThemedText>
                    </View>
                  )}
                  <ThemedText style={[styles.thumbLabel, { color: placeholder }]}>
                    {photo.captured_date}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <ThemedText style={[styles.hintText, { color: placeholder }]}>
              Tap to view · Long-press to delete
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>

      {/* Fullscreen preview */}
      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <Pressable style={styles.modalBg} onPress={() => setPreview(null)} accessibilityRole="button" accessibilityLabel="Close photo preview">
          {preview?.signed_url && (
            <Image
              source={{ uri: preview.signed_url }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
          <View style={[styles.modalFooter, { paddingBottom: insets.bottom + 16 }]}>
            <ThemedText style={[styles.modalText, { color: '#fff' }]}>
              {preview?.captured_date} {preview?.pose ? `· ${preview.pose}` : ''}
            </ThemedText>
          </View>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const THUMB = 110;
const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  retryBtn: { marginTop: 12, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  errorBannerText: { fontSize: 13, lineHeight: 18 },
  cardTitle: { marginBottom: 12 },
  poseRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  poseBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  poseBtnText: { fontSize: 14 },
  addBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  addBtnText: { fontSize: 16 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  thumbWrap: { width: THUMB, alignItems: 'center' },
  thumb: { width: THUMB, height: THUMB, borderRadius: 10 },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbLabel: { fontSize: 11, marginTop: 4 },
  hintText: { fontSize: 11, marginTop: 12, fontStyle: 'italic', textAlign: 'center' },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: { width: '100%', height: '85%' },
  modalFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  modalText: { fontSize: 14, fontWeight: '600' },
});
