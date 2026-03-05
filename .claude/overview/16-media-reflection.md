# Media & Reflection

> Photo/video attachments and personal session notes for workouts.

---

## Overview

Users can attach **photos and videos** to workouts and write **personal reflections** after each session. Media is stored in Supabase Storage with signed URL access. Reflections are stored directly in the workouts table.

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/mediaUpload.ts` | Upload pipeline (pick, upload, record, retrieve, delete) |
| `components/media/MediaPickerBubble.tsx` | Horizontal thumbnail gallery with add button |
| `components/media/ReflectionInput.tsx` | Themed multiline text input card |
| `components/modals/SessionReviewModal.tsx` | Post-workout modal integrating both |
| `app/history/[id].tsx` | History detail showing saved media + reflection |
| `plugins/withImagePicker.js` | Expo config plugin for media permissions |
| `supabase/migrations/0027_add_media_and_reflection.sql` | DB schema |

---

## Database Schema

### workout_media table
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `workout_id` | uuid | FK to workouts |
| `user_id` | uuid | FK to auth.users |
| `storage_path` | text | Path in storage bucket |
| `media_type` | text | 'image' or 'video' |
| `file_size_bytes` | bigint | File size (max 50MB) |
| `created_at` | timestamptz | Auto-set |

**RLS Policies:**
- `wm_sel` - Users can only SELECT their own media
- `wm_ins` - Users can only INSERT their own media
- `wm_del` - Users can only DELETE their own media

### workouts table additions
| Column | Type | Description |
|--------|------|-------------|
| `reflection` | text | Personal session notes (max 2000 chars) |
| `review_json` | text | AI-generated session review as JSON |

---

## Media Upload Pipeline

### Flow
```
User taps "+" in MediaPickerBubble
       │
       ▼
pickMedia() → opens device image/video picker
  (0.8 quality, multi-select, max 10)
       │
       ▼
Local thumbnails shown immediately
       │
       ▼ (on save)
uploadMediaToStorage(file, userId, workoutId)
  → Supabase Storage: {userId}/{workoutId}/{uuid}.{ext}
       │
       ▼
recordMediaInDb(record)
  → workout_media table insert
       │
       ▼
Media available via signed URLs
```

### Key Functions (lib/mediaUpload.ts)

| Function | Purpose |
|----------|---------|
| `pickMedia()` | Opens device picker, returns local URIs |
| `uploadMediaToStorage(file, userId, workoutId)` | Uploads to Supabase Storage bucket |
| `recordMediaInDb(record)` | Inserts into workout_media table |
| `uploadAndRecordMedia(file, userId, workoutId)` | Combined upload + record |
| `getMediaSignedUrls(workoutId)` | Generates 1-hour TTL signed URLs |
| `deleteMedia(mediaId, storagePath)` | Removes from storage + DB |

### Constraints
- Max **10 files** per workout
- Max **50MB** per file
- Allowed types: JPEG, PNG, HEIC, WebP, MP4, MOV
- Signed URLs expire after **1 hour**

---

## Reflection

A simple text field for personal session notes:
- Max 2000 characters
- Stored in `workouts.reflection` column
- Saved via PATCH `/history/{workoutId}`
- Displayed in history detail view

---

## Permissions (plugins/withImagePicker.js)

Expo config plugin that injects native permissions:

**iOS:**
- `NSPhotoLibraryUsageDescription` - Photo library access
- `NSCameraUsageDescription` - Camera access

**Android:**
- `CAMERA`
- `READ_MEDIA_IMAGES`
- `READ_MEDIA_VIDEO`
- `READ_EXTERNAL_STORAGE` (legacy)

---

## Usage in Session Review

After ending a workout, the SessionReviewModal integrates media + reflection:

1. AI generates session review (rating, strengths, weakness, next note)
2. Modal displays review with MediaPickerBubble and ReflectionInput
3. User attaches photos/videos and writes reflection
4. On save:
   - Media uploads happen in parallel
   - review_json saved to workouts table
   - reflection saved to workouts table
   - Media records inserted to workout_media table

---

## Usage in History Detail

The history detail screen (`app/history/[id].tsx`) displays:
- Session review card with rating emoji, strengths, improvement, next note
- Media gallery with signed URLs (auto-refreshed on expiry)
- Reflection text (read-only)

---

## Implementing Changes

### Adding a new media type
1. Update allowed types in `mediaUpload.ts`
2. Update `media_type` check constraint in migration
3. Update `withImagePicker.js` if new permissions needed

### Changing file limits
1. Update `MAX_FILES` constant in `mediaUpload.ts`
2. Update `maxItems` prop on MediaPickerBubble
3. Update check constraint in migration if changing size limit

---

## Related Docs
- [09-modals.md](./09-modals.md) - SessionReviewModal
- [03-workout-flow.md](./03-workout-flow.md) - Workout end flow
- [05-storage.md](./05-storage.md) - Storage patterns
- [15-edge-functions.md](./15-edge-functions.md) - History endpoint
