/**
 * Media upload utilities for workout photos/videos.
 * Uses expo-image-picker for selection and Supabase Storage for upload.
 * Upload path: {userId}/{workoutId}/{uuid}.{ext}
 * Private bucket with signed URLs (1hr TTL).
 */

import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { File as ExpoFile } from 'expo-file-system';
import { supabase } from '@/lib/supabase';

const BUCKET = 'workout-media';
const MAX_FILES_PER_WORKOUT = 10;
const SIGNED_URL_TTL = 3600; // 1 hour in seconds

/**
 * Normalized asset type returned by pickMedia().
 * Matches the shape expected by uploadMediaToStorage() and SessionReviewModal.
 */
export type PickedAsset = {
    uri: string;
    type?: string;        // mime type (e.g. 'image/jpeg', 'video/mp4')
    fileName?: string;
    fileSize?: number;
};

export type MediaItem = {
    id?: string;
    uri: string;             // local URI before upload, signed URL after
    storagePath?: string;    // path in Supabase Storage
    mediaType: 'image' | 'video';
    fileSizeBytes?: number;
    uploading?: boolean;
    error?: string;
};

/**
 * Opens the device photo/video library and returns selected assets.
 * Quality: 0.8 compression. Multi-select enabled.
 */
export async function pickMedia(currentCount: number = 0): Promise<PickedAsset[]> {
    const remaining = MAX_FILES_PER_WORKOUT - currentCount;
    if (remaining <= 0) {
        throw new Error(`Maximum of ${MAX_FILES_PER_WORKOUT} files per workout`);
    }

    // Request permissions (iOS prompts automatically, Android needs explicit request)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
        throw new Error('Photo library permission is required to add media.');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.8,
        // Force iOS to transcode HEIC → JPEG before returning URI
        preferredAssetRepresentationMode:
            ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled) {
        return [];
    }

    // Normalize expo-image-picker assets to PickedAsset shape
    return (result.assets ?? []).map((a) => ({
        uri: a.uri,
        type: a.mimeType ?? undefined,
        fileName: a.fileName ?? undefined,
        fileSize: a.fileSize ?? undefined,
    }));
}

/**
 * Upload a single media file to Supabase Storage.
 * Path: {userId}/{workoutId}/{uuid}.{ext}
 */
export async function uploadMediaToStorage(
    asset: PickedAsset,
    userId: string,
    workoutId: string,
): Promise<{ storagePath: string; mediaType: 'image' | 'video'; fileSizeBytes: number }> {
    const uri = asset.uri;
    if (!uri) throw new Error('No URI on asset');

    let ext = getExtension(asset.fileName || uri, asset.type);
    // Force HEIC → JPEG (React Native <Image> can't reliably decode remote HEIC)
    if (ext === 'heic') ext = 'jpg';

    const uuid = Crypto.randomUUID();
    const storagePath = `${userId}/${workoutId}/${uuid}.${ext}`;

    const mediaType: 'image' | 'video' = asset.type?.startsWith('video') ? 'video' : 'image';
    let contentType = asset.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
    // Override HEIC mime type to JPEG
    if (contentType === 'image/heic' || contentType === 'image/heif') {
        contentType = 'image/jpeg';
    }

    // Read file via expo-file-system File API (reliable for all RN URI schemes)
    const file = new ExpoFile(uri);
    const arrayBuffer = await file.arrayBuffer();

    // Validate — reject corrupt/empty files
    if (arrayBuffer.byteLength < 100) {
        throw new Error(`File appears empty or corrupt (${arrayBuffer.byteLength} bytes)`);
    }


    // Upload ArrayBuffer (supabase-js accepts ArrayBuffer directly)
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, arrayBuffer, {
            contentType,
            upsert: false,
        });

    if (error) {
        console.error('[mediaUpload] Upload failed:', error);
        throw new Error(`Upload failed: ${error.message}`);
    }

    return {
        storagePath,
        mediaType,
        fileSizeBytes: arrayBuffer.byteLength,
    };
}

/**
 * Record uploaded media in the workout_media table.
 */
export async function recordMediaInDb(
    workoutId: string,
    userId: string,
    storagePath: string,
    mediaType: 'image' | 'video',
    fileSizeBytes: number,
): Promise<void> {
    const { error } = await supabase
        .from('workout_media')
        .insert({
            workout_id: workoutId,
            user_id: userId,
            storage_path: storagePath,
            media_type: mediaType,
            file_size_bytes: fileSizeBytes,
        });

    if (error) {
        console.error('[mediaUpload] DB insert failed:', error);
        throw new Error(`Failed to record media: ${error.message}`);
    }
}

/**
 * Full upload flow: upload to storage + record in DB.
 */
export async function uploadAndRecordMedia(
    asset: PickedAsset,
    userId: string,
    workoutId: string,
): Promise<{ storagePath: string; mediaType: 'image' | 'video' }> {
    const result = await uploadMediaToStorage(asset, userId, workoutId);
    await recordMediaInDb(workoutId, userId, result.storagePath, result.mediaType, result.fileSizeBytes);
    return { storagePath: result.storagePath, mediaType: result.mediaType };
}

/**
 * Get a signed URL for a single storage path.
 * Returns the URL string, or null on failure.
 */
export async function getSignedUrl(storagePath: string): Promise<string | null> {
    try {
        const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(storagePath, SIGNED_URL_TTL);

        if (error) {
            console.warn('[mediaUpload] getSignedUrl FAILED:', storagePath, '→', error.message);
            return null;
        }

        const url = data?.signedUrl ?? null;
        if (url) {
        } else {
            console.warn('[mediaUpload] getSignedUrl returned null data for:', storagePath);
        }
        return url;
    } catch (err) {
        console.error('[mediaUpload] getSignedUrl threw:', err);
        return null;
    }
}

/**
 * Get signed URLs for a list of storage paths.
 * Returns map of storagePath -> signedUrl.
 *
 * Strategy: try batch first (one network call). If batch fails or returns
 * partial results, fall back to individual calls for any missing paths.
 */
export async function getMediaSignedUrls(
    storagePaths: string[]
): Promise<Record<string, string>> {
    if (storagePaths.length === 0) return {};

    const result: Record<string, string> = {};

    try {
        const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrls(storagePaths, SIGNED_URL_TTL);

        if (error) {
            console.warn('[mediaUpload] Batch signed URL error:', error.message, '| Falling back to individual');
            // Fall through to individual fallback below
        } else {
            // Match by array index — response order matches input order.
            // This avoids issues where item.path is null or formatted differently.
            const items = data ?? [];
            for (let i = 0; i < storagePaths.length; i++) {
                const item = items[i];
                if (item?.signedUrl) {
                    result[storagePaths[i]] = item.signedUrl;
                }
            }
        }
    } catch (err) {
        console.error('[mediaUpload] Batch createSignedUrls threw:', err);
    }

    // Individual fallback for any paths that didn't resolve
    const missing = storagePaths.filter((p) => !result[p]);
    if (missing.length > 0) {
        await Promise.allSettled(
            missing.map(async (path) => {
                const url = await getSignedUrl(path);
                if (url) {
                    result[path] = url;
                }
            })
        );
    }

    return result;
}

/**
 * Delete a media file from storage and the DB record.
 */
export async function deleteMedia(
    mediaId: string,
    storagePath: string,
): Promise<void> {
    // Delete from storage
    const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([storagePath]);

    if (storageError) {
        console.error('[mediaUpload] Storage delete failed:', storageError);
        // Continue to delete DB record even if storage fails
    }

    // Delete DB record
    const { error: dbError } = await supabase
        .from('workout_media')
        .delete()
        .eq('id', mediaId);

    if (dbError) {
        console.error('[mediaUpload] DB delete failed:', dbError);
        throw new Error(`Failed to delete media: ${dbError.message}`);
    }
}

// -- Helpers --

function getExtension(filename: string, mimeType?: string | null): string {
    // Try from filename
    const parts = filename.split('.');
    if (parts.length > 1) {
        const ext = parts.pop()!.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'heic', 'webp', 'mp4', 'mov'].includes(ext)) {
            return ext;
        }
    }

    // Fall back to mime type
    const mimeMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/heic': 'jpg',   // HEIC → jpg (RN can't decode remote HEIC reliably)
        'image/heif': 'jpg',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'video/quicktime': 'mov',
    };

    if (mimeType && mimeMap[mimeType]) {
        return mimeMap[mimeType];
    }

    return 'jpg'; // safe default
}
