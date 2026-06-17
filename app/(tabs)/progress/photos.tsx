import React, { useCallback, useEffect, useState } from 'react';
import {
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

  const { session } = useAuth();
  const userId = session?.user?.id ?? '';

  const { toast, showToast, hideToast } = useToast();
  const [photos, setPhotos] = useState<BodyPhoto[]>([]);
  const [pose, setPose] = useState<Pose>('front');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<BodyPhoto | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await fetchBodyPhotos(180);
      setPhotos(list);
    } catch (e) {
      console.warn('[photos] load failed', e);
    }
  }, []);

  useEffect(() => {
    load();
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
        capturedDate: new Date().toISOString().slice(0, 10),
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
  }, [userId, pose, load]);

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
  }, [load]);

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
          >
            <ThemedText type="defaultSemiBold" style={[styles.addBtnText, { color: onTint }]}>
              {uploading ? 'Uploading…' : 'Add photo'}
            </ThemedText>
          </Pressable>
        </View>

        {/* Grid */}
        {photos.length === 0 ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={{ color: placeholder }}>No photos yet.</ThemedText>
          </View>
        ) : (
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
        )}
      </ScrollView>

      {/* Fullscreen preview */}
      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <Pressable style={styles.modalBg} onPress={() => setPreview(null)}>
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
  addBtnText: { color: '#fff', fontSize: 16 },
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
