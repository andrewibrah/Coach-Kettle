  Library: react-native-image-picker (v8.x)                                                                                                                    
                                                                                                                                                               
  The standard React Native community library. Provides launchImageLibrary() with multi-select, returns URIs + metadata. Since the app already uses a custom   
  dev client (for expo-apple-authentication), adding another native module just requires a prebuild.                                                           
                                                                                                                                                               
  One honest caveat: This requires a custom Expo config plugin (small JS file) to inject iOS/Android permissions, plus npx expo prebuild after install. No way
  around it with any non-expo image picker.

  ---
  Implementation Order

  Phase 1: Database + Storage

  Migration 0027_add_media_and_reflection.sql:
  - ALTER TABLE workouts ADD COLUMN reflection text
  - CREATE TABLE workout_media (id, workout_id, user_id, storage_path, media_type, file_size_bytes, created_at) with CASCADE delete + RLS
  - INSERT INTO storage.buckets — private workout-media bucket (50MB limit, JPEG/PNG/HEIC/WebP/MP4/MOV)
  - Storage RLS: users write/read/delete only under their {user_id}/ folder

  Phase 2: Edge Function

  Modify supabase/functions/history/index.ts:
  - POST: include reflection in upsert
  - GET: return reflection + joined workout_media paths
  - New PATCH handler: update reflection on existing workouts

  Phase 3: Package + Native Setup

  - npm install react-native-image-picker
  - Create plugins/withImagePicker.js (Expo config plugin for iOS/Android permissions)
  - Update app.json with plugin + permission strings
  - npx expo prebuild to regenerate native projects

  Phase 4: Client Library

  ┌────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────┐
  │                New File                │                                       Purpose                                       │
  ├────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ lib/mediaUpload.ts                     │ pickMedia(), uploadMediaToStorage(), getMediaSignedUrls(), deleteMediaFromStorage() │
  ├────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ components/media/MediaPickerBubble.tsx │ Horizontal thumbnail row with "+" add button                                        │
  ├────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ components/media/ReflectionInput.tsx   │ Multiline text card for personal notes                                              │
  └────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────┘

  ┌───────────────────────┬──────────────────────────────────────────────────────────────────────┐
  │     Modified File     │                                Change                                │
  ├───────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ lib/workoutStorage.ts │ Add reflection?: string, mediaUrls?: string[] to WorkoutSession type │
  ├───────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ lib/api.ts            │ Add updateWorkoutMeta() method                                       │
  └───────────────────────┴──────────────────────────────────────────────────────────────────────┘

  Phase 5: UI Integration

  SessionReviewModal layout (top to bottom):
  Rating Card          (existing)
  Strengths            (existing)
  Area to Improve      (existing)
  For Next Session     (existing)
  ───────────────────────────────
  Media Picker Bubble  (NEW — "Add Photos/Videos")
  Session Reflection   (NEW — multiline TextInput)
  ───────────────────────────────
  Done button          (existing — now also saves reflection + media)

  History detail (app/history/[id].tsx):
  - Media gallery section (view + add more)
  - Reflection card (view + edit)

  Phase 6: Wiring in index.tsx

  - Add reflection + mediaPaths state
  - Pass workoutId / userId to SessionReviewModal
  - On modal close → save reflection + media via API
  - Fix timing: store workoutId in a ref before endWorkoutSession() clears it

  ---
  Key Constraints

  ┌───────────────────────┬───────────────────────────────────────────────────────────┐
  │                       │                           Value                           │
  ├───────────────────────┼───────────────────────────────────────────────────────────┤
  │ Max file size         │ 50MB (matches supabase config)                            │
  ├───────────────────────┼───────────────────────────────────────────────────────────┤
  │ Max media per workout │ 5-10                                                      │
  ├───────────────────────┼───────────────────────────────────────────────────────────┤
  │ Image types           │ JPEG, PNG, HEIC, WebP                                     │
  ├───────────────────────┼───────────────────────────────────────────────────────────┤
  │ Video types           │ MP4, QuickTime (.mov)                                     │
  ├───────────────────────┼───────────────────────────────────────────────────────────┤
  │ Image quality         │ 0.8 compression via picker                                │
  ├───────────────────────┼───────────────────────────────────────────────────────────┤
  │ Storage               │ Private bucket, signed URLs (1hr TTL)                     │
  ├───────────────────────┼───────────────────────────────────────────────────────────┤
  │ Upload method         │ Direct client → Supabase Storage (no edge function proxy) │
  └───────────────────────┴───────────────────────────────────────────────────────────┘