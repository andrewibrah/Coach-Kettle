import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { File as ExpoFile } from 'expo-file-system';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BarcodeScannerModal } from '@/components/nutrition/BarcodeScannerModal';
import { useThemeColor } from '@/hooks/useThemeColor';

import { useNutrition } from '@/contexts/NutritionContext';
import { trackProductEvent } from '@/lib/analytics';
import {
  analyzeNutritionPhoto,
  analyzeNutritionText,
  BarcodeLookupError,
  confirmNutritionAnalysis,
  lookupBarcode,
  nutritionAnalysisErrorMessage,
  nutritionConfirmErrorMessage,
  searchFoods,
} from '@/lib/nutrition';
import { formatBrandedFoodName } from '@/lib/barcode';
import { todayISO } from '@/lib/workoutRules';
import type {
  BarcodeFood,
  FoodItem,
  MealSlot,
  NutritionAnalysisItem,
  NutritionAnalysisMode,
  NutritionAnalysisResult,
  RecentFood,
} from '@/types/nutrition';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

type ReviewItemDraft = Omit<
  NutritionAnalysisItem,
  'estimated_weight_g' | 'estimated_calories' | 'protein_g' | 'carbs_g' | 'fat_g'
> & {
  estimated_weight_g: string;
  estimated_calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
};

type ReviewNumberField =
  | 'estimated_weight_g'
  | 'estimated_calories'
  | 'protein_g'
  | 'carbs_g'
  | 'fat_g';

function toReviewDraft(item: NutritionAnalysisItem): ReviewItemDraft {
  return {
    ...item,
    estimated_weight_g: String(item.estimated_weight_g),
    estimated_calories: String(item.estimated_calories),
    protein_g: String(item.protein_g),
    carbs_g: String(item.carbs_g),
    fat_g: String(item.fat_g),
  };
}

function parseReviewItems(items: ReviewItemDraft[]): NutritionAnalysisItem[] | null {
  const limits: Record<ReviewNumberField, [number, number]> = {
    estimated_weight_g: [0.1, 5_000],
    estimated_calories: [0, 10_000],
    protein_g: [0, 500],
    carbs_g: [0, 1_000],
    fat_g: [0, 500],
  };

  const parsed: NutritionAnalysisItem[] = [];
  for (const item of items) {
    const foodType = item.food_type.trim().replace(/\s+/g, ' ');
    if (!foodType || foodType.length > 120) return null;

    const numbers = {} as Record<ReviewNumberField, number>;
    for (const field of Object.keys(limits) as ReviewNumberField[]) {
      const value = Number(item[field]);
      const [min, max] = limits[field];
      if (!Number.isFinite(value) || value < min || value > max) return null;
      numbers[field] = Math.round(value * 100) / 100;
    }

    parsed.push({
      ...item,
      food_type: foodType,
      ...numbers,
    });
  }
  return parsed;
}

async function readPhotoBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS !== 'web' && /^(?:file|content):/i.test(uri)) {
    return new ExpoFile(uri).arrayBuffer();
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Photo could not be read');
  return response.arrayBuffer();
}

function detectPhotoMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  throw new Error('Choose a JPEG, PNG, or WebP photo');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return globalThis.btoa(binary);
}

/**
 * Present a barcode-resolved product through the same "selected food" card the
 * catalog search uses.
 *
 * The synthetic `id` is for React keys and display only — it is NOT a
 * `public.foods` primary key, so logging must pass `food_id: null` or the
 * food_logs.food_id foreign key rejects the insert. `selectedBarcode` tracks
 * that distinction.
 */
function barcodeFoodToItem(food: BarcodeFood): FoodItem {
  const now = new Date().toISOString();
  return {
    id: `barcode:${food.barcode}`,
    user_id: null,
    is_global: false,
    name: formatBrandedFoodName(food.name, food.brand),
    brand: food.brand,
    // Guaranteed > 0 by the mapper; a 0 here would make toServings() silently
    // treat every gram/oz amount as exactly one serving.
    serving_size_g: food.serving_size_g,
    serving_label: food.serving_label,
    calories: food.calories,
    protein_g: food.protein_g,
    carbs_g: food.carbs_g,
    fat_g: food.fat_g,
    fiber_g: food.fiber_g,
    saturated_fat_g: food.saturated_fat_g,
    sugar_g: food.sugar_g,
    sodium_mg: food.sodium_mg,
    tags: [],
    created_at: now,
    updated_at: now,
  };
}

export default function LogFoodScreen() {
  const router = useRouter();
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

  const { logFood, recentFoods, refresh } = useNutrition();

  const [captureMode, setCaptureMode] = useState<NutritionAnalysisMode>('text');
  const [captureText, setCaptureText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<NutritionAnalysisResult | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItemDraft[]>([]);
  const [reviewMealSlot, setReviewMealSlot] = useState<MealSlot>('breakfast');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [confirmingAnalysis, setConfirmingAnalysis] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [servings, setServings] = useState('1');
  const [unit, setUnit] = useState<'serving' | 'g' | 'oz' | 'lb' | 'cup' | 'tbsp' | 'tsp' | 'fl oz'>('serving');
  const [mealSlot, setMealSlot] = useState<MealSlot>('breakfast');
  const [submitting, setSubmitting] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  // Barcode scanning. `selectedBarcode` is non-null only while `selected` came
  // from a scan, which is what keeps food_id NULL on the resulting log row.
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const lookupAbortRef = useRef<AbortController | null>(null);

  // Roughly half of retail barcodes are missing upstream, so the manual-entry
  // fallback is a primary path — jump the user to it instead of leaving the
  // prefilled form below the fold.
  const scrollRef = useRef<ScrollView | null>(null);
  const quickLogYRef = useRef(0);

  // Cancel any in-flight lookup on unmount so it can't set state on a dead
  // component (and so a backgrounded request doesn't linger).
  useEffect(() => () => lookupAbortRef.current?.abort(), []);

  // Quick log fields
  const [quickName, setQuickName] = useState('');
  const [quickCal, setQuickCal] = useState('');
  const [quickProt, setQuickProt] = useState('');
  const [quickCarb, setQuickCarb] = useState('');
  const [quickFat, setQuickFat] = useState('');
  const [quickFiber, setQuickFiber] = useState('');
  const [quickSatFat, setQuickSatFat] = useState('');
  const [quickMealSlot, setQuickMealSlot] = useState<MealSlot>('breakfast');
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  const selectCaptureMode = (mode: NutritionAnalysisMode) => {
    if (analyzing) return;
    setCaptureMode(mode);
    setCaptureError(null);
    if (mode === 'photo') setCaptureText('');
  };

  const openAnalysisReview = (result: NutritionAnalysisResult) => {
    setAnalysisResult(result);
    setReviewItems(result.items.map(toReviewDraft));
    setReviewMealSlot('breakfast');
    setReviewError(null);
    void trackProductEvent({
      name: 'nutrition_analysis_completed',
      properties: { mode: result.mode, cache_hit: result.analysis_id === null },
    });
  };

  const handleAnalyzeText = async () => {
    if (analyzing || !captureText.trim()) {
      if (!captureText.trim()) setCaptureError('Describe the food or meal first.');
      return;
    }
    setAnalyzing(true);
    setCaptureError(null);
    void trackProductEvent({ name: 'nutrition_capture_opened', properties: { mode: 'text' } });
    try {
      openAnalysisReview(await analyzeNutritionText(captureText));
    } catch (error) {
      console.warn('[nutrition] text analysis failed', error);
      setCaptureError(nutritionAnalysisErrorMessage(error, 'text'));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzePhoto = async () => {
    if (analyzing) return;
    setCaptureError(null);
    void trackProductEvent({ name: 'nutrition_capture_opened', properties: { mode: 'photo' } });

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setCaptureError('Photo library access is required to analyze a meal photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled || !result.assets?.length) return;

    setAnalyzing(true);
    try {
      const buffer = await readPhotoBytes(result.assets[0].uri);
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_PHOTO_BYTES) {
        throw new Error('Photo must be 6 MB or smaller');
      }
      const bytes = new Uint8Array(buffer);
      const mime = detectPhotoMime(bytes);
      const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;
      openAnalysisReview(await analyzeNutritionPhoto(dataUrl));
    } catch (error) {
      console.warn('[nutrition] photo analysis failed', error);
      const message = error instanceof Error && (
        error.message === 'Photo must be 6 MB or smaller' ||
        error.message === 'Choose a JPEG, PNG, or WebP photo'
      ) ? error.message : nutritionAnalysisErrorMessage(error, 'photo');
      setCaptureError(message);
    } finally {
      setAnalyzing(false);
    }
  };

  const updateReviewItem = (
    index: number,
    field: 'food_type' | ReviewNumberField,
    value: string,
  ) => {
    setReviewItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
    setReviewError(null);
  };

  const closeAnalysisReview = () => {
    if (confirmingAnalysis) return;
    setAnalysisResult(null);
    setReviewItems([]);
    setReviewError(null);
  };

  const handleConfirmAnalysis = async () => {
    if (!analysisResult || confirmingAnalysis) return;
    const items = parseReviewItems(reviewItems);
    if (!items) {
      setReviewError('Check every food name, weight, calorie, and macro value.');
      return;
    }

    setConfirmingAnalysis(true);
    setReviewError(null);
    try {
      if (analysisResult.analysis_id) {
        await confirmNutritionAnalysis({
          analysis_id: analysisResult.analysis_id,
          date: todayISO(),
          meal_slot: reviewMealSlot,
          items,
        });
        await refresh();
      } else {
        const item = items[0];
        if (items.length !== 1 || item.catalog_match !== 'exact') {
          throw new Error('Invalid catalog analysis');
        }
        await logFood({
          date: todayISO(),
          meal_slot: reviewMealSlot,
          food_id: null,
          food_name: item.food_type,
          servings: 1,
          calories: item.estimated_calories,
          protein_g: item.protein_g,
          carbs_g: item.carbs_g,
          fat_g: item.fat_g,
          fiber_g: 0,
          saturated_fat_g: 0,
        });
      }
      void trackProductEvent({
        name: 'nutrition_log_confirmed',
        properties: { mode: analysisResult.mode, item_count: items.length },
      });
      setAnalysisResult(null);
      setReviewItems([]);
      router.back();
    } catch (error) {
      console.warn('[nutrition] analysis confirmation failed', error);
      setReviewError(nutritionConfirmErrorMessage(error));
    } finally {
      setConfirmingAnalysis(false);
    }
  };

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await searchFoods(query);
        if (!cancelled) setResults(res.foods ?? []);
      } catch (e) {
        if (!cancelled) {
          console.warn('[nutrition] search failed', e);
          setResults([]);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  // ---------- Barcode scanning ----------

  const openScanner = useCallback(() => {
    setScanNotice(null);
    setLogError(null);
    setScannerOpen(true);
    void trackProductEvent({ name: 'nutrition_capture_opened', properties: { mode: 'barcode' } });
  }, []);

  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    if (lookingUp) return;

    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;

    setLookingUp(true);
    setScanNotice(null);
    try {
      const result = await lookupBarcode(barcode, controller.signal);
      if (controller.signal.aborted) return;

      if (result.status === 'found') {
        // Reset the amount controls so a previous selection's grams/oz entry
        // can't carry over onto a product with a different serving size.
        setSelected(barcodeFoodToItem(result.food));
        setSelectedBarcode(result.barcode);
        setServings('1');
        setUnit('serving');
        setResults([]);
        setQuery('');
        setLogError(null);
        setScannerOpen(false);
        setScanNotice(
          result.food.basis === 'serving'
            ? `Found "${result.food.name}". Check the amount, then log it.`
            : `Found "${result.food.name}". Values are per ${result.food.basis === '100ml' ? '100 ml' : '100 g'} — set the amount you ate.`,
        );
        void trackProductEvent({
          name: 'nutrition_analysis_completed',
          properties: { mode: 'barcode', cache_hit: result.source === 'cache' },
        });
        return;
      }

      // Not found / incomplete are ordinary outcomes: roughly half of retail
      // barcodes are absent upstream. Prefill quick log instead of erroring.
      const knownName = result.status === 'incomplete'
        ? [result.brand, result.name].filter(Boolean).join(' ').trim()
        : '';
      setScannerOpen(false);
      setSelected(null);
      setSelectedBarcode(null);
      // Reset EVERY quick-log field, not just the name. Leaving macros from a
      // previously typed food next to a freshly prefilled name is one tap away
      // from logging the new food with the old food's calories.
      setQuickName(knownName);
      setQuickCal('');
      setQuickProt('');
      setQuickCarb('');
      setQuickFat('');
      setQuickFiber('');
      setQuickSatFat('');
      setQuickError(null);
      setScanNotice(
        knownName
          ? `Found "${knownName}", but it has no nutrition info. Add the numbers below from the label.`
          : `Barcode ${barcode} isn't in the food database yet. Add it below from the label — it only takes a moment.`,
      );
      // Let the modal finish dismissing before scrolling, or the offset is
      // measured against a screen that is still covered.
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, quickLogYRef.current - 12), animated: true });
      }, 350);
      void trackProductEvent({
        name: 'nutrition_analysis_completed',
        properties: { mode: 'barcode', cache_hit: result.source === 'cache' },
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.warn('[nutrition] barcode lookup failed', error);
      setScannerOpen(false);
      // A server-explained failure must not read as a network fault: the daily
      // gate is increment-first, so telling a rate-limited user to "check your
      // connection" invites retries that push them further past the cap.
      const code = error instanceof BarcodeLookupError ? error.code : null;
      setScanNotice(
        code === 'BARCODE_LIMIT_REACHED'
          ? "You've hit today's barcode lookup limit. Add this food below, or scan again tomorrow."
          : code === 'BARCODE_UPSTREAM_UNAVAILABLE' || code === 'BARCODE_GATE_UNAVAILABLE'
            ? 'The food database is unavailable right now. Add the food below from the label.'
            : 'Could not look up that barcode. Check your connection, or add the food below.',
      );
    } finally {
      if (lookupAbortRef.current === controller) lookupAbortRef.current = null;
      // Always clear, even when aborted. Setting state after unmount is a no-op
      // in React 18+, whereas skipping this would strand `lookingUp` at true and
      // permanently disable the scan button (it is disabled while looking up).
      setLookingUp(false);
    }
  }, [lookingUp]);

  /**
   * Closing must ALWAYS work, including mid-lookup. `lookupBarcode` has no
   * client-side timeout (React Native `fetch` has none, and the function's 8s
   * budget only bounds its own upstream call), so gating close on `lookingUp`
   * left a stalled connection showing an uncloseable sheet with no cancel.
   */
  const closeScanner = useCallback(() => {
    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;
    setLookingUp(false);
    setScannerOpen(false);
  }, []);

  // Stable identity: an inline arrow would re-set the native scanner's callback
  // prop on every render of this fairly large screen.
  const handleScannedBarcode = useCallback((barcode: string) => {
    void handleBarcodeScanned(barcode);
  }, [handleBarcodeScanned]);

  const handleLogSelected = async () => {
    const today = todayISO();
    if (!selected || submitting) return;
    const s = servingsNum;
    setSubmitting(true);
    setLogError(null);
    try {
      await logFood({
        date: today,
        meal_slot: mealSlot,
        // A barcode result is not a public.foods row — passing its synthetic id
        // would violate the food_logs.food_id foreign key. A "recently logged"
        // pill built from a quick-log entry has no food_id either and carries
        // '' as its id, which Postgres rejects as a UUID.
        food_id: selectedBarcode || !selected.id ? null : selected.id,
        food_name: selected.name,
        servings: s,
        calories: selected.calories * s,
        protein_g: selected.protein_g * s,
        carbs_g: selected.carbs_g * s,
        fat_g: selected.fat_g * s,
        fiber_g: selected.fiber_g * s,
        saturated_fat_g: selected.saturated_fat_g * s,
      });
      router.back();
    } catch (e) {
      console.warn('[nutrition] log failed', e);
      setLogError('Failed to log food. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLog = async () => {
    const today = todayISO();
    setQuickError(null);
    const cal = parseFloat(quickCal);
    const prot = parseFloat(quickProt);
    const carb = parseFloat(quickCarb);
    const fat = parseFloat(quickFat);
    if (!quickName.trim()) { setQuickError('Name is required'); return; }
    if (isNaN(cal) || isNaN(prot) || isNaN(carb) || isNaN(fat)) {
      setQuickError('All macro fields must be numbers');
      return;
    }
    setQuickSubmitting(true);
    try {
      await logFood({
        date: today,
        meal_slot: quickMealSlot,
        food_id: null,
        food_name: quickName.trim(),
        servings: 1,
        calories: cal,
        protein_g: prot,
        carbs_g: carb,
        fat_g: fat,
        fiber_g: parseFloat(quickFiber) || 0,
        saturated_fat_g: parseFloat(quickSatFat) || 0,
      });
      router.back();
    } catch (e) {
      console.warn('[nutrition] quick log failed', e);
      setQuickError('Failed to log. Try again.');
    } finally {
      setQuickSubmitting(false);
    }
  };

  const renderSlotPicker = (current: MealSlot, setter: (s: MealSlot) => void) => (
    <View style={{ flexDirection: 'row', gap: 6, marginVertical: 8, flexWrap: 'wrap' }}>
      {SLOTS.map((slot) => {
        const active = current === slot;
        return (
          <Pressable
            key={slot}
            onPress={() => setter(slot)}
            style={({ pressed }) => [
              styles.slotBtn,
              { borderColor: border, backgroundColor: active ? tint : 'transparent' },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="tab"
            accessibilityLabel={slot}
            accessibilityState={{ selected: active }}
          >
            <ThemedText
              style={{
                color: active ? onTint : textColor,
                fontWeight: '600',
                textTransform: 'capitalize',
                fontSize: 13,
              }}
            >
              {slot}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );

  type Unit = typeof unit;
  const UNITS: { key: Unit; label: string; volumetric?: boolean }[] = [
    { key: 'serving', label: 'Serving' },
    { key: 'g',      label: 'g' },
    { key: 'oz',     label: 'oz' },
    { key: 'lb',     label: 'lb' },
    { key: 'cup',    label: 'cup',   volumetric: true },
    { key: 'tbsp',   label: 'tbsp',  volumetric: true },
    { key: 'tsp',    label: 'tsp',   volumetric: true },
    { key: 'fl oz',  label: 'fl oz', volumetric: true },
  ];

  // ml-equivalent per unit (volume units use water density as approximation)
  const TO_GRAMS: Record<Unit, number> = {
    serving: 0,
    g:       1,
    oz:      28.3495,
    lb:      453.592,
    cup:     240,
    tbsp:    14.787,
    tsp:     4.929,
    'fl oz': 29.574,
  };

  const toServings = (raw: string, u: Unit, sizeG: number): number => {
    const v = parseFloat(raw);
    if (!v || v <= 0) return 1;
    if (u === 'serving') return v;
    if (!sizeG || sizeG <= 0) return 1; // no gram weight on record — can't convert, treat as 1 serving
    return (v * TO_GRAMS[u]) / sizeG;
  };

  const servingsNum = toServings(servings, unit, selected?.serving_size_g ?? 0);

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader title="Log food" subtitle="Analyze, search, or quick add" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Text or photo analysis */}
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={{ marginBottom: 4 }}>Analyze a meal</ThemedText>
          <ThemedText style={{ color: placeholder, fontSize: 13, marginBottom: 10 }}>
            Describe your food or choose a meal photo, then review the estimate before logging.
          </ThemedText>
          <View style={styles.captureTabs} accessibilityRole="tablist">
            {(['text', 'photo'] as const).map((mode) => {
              const active = captureMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => selectCaptureMode(mode)}
                  disabled={analyzing}
                  style={({ pressed }) => [
                    styles.captureTab,
                    { borderColor: active ? tint : border, backgroundColor: active ? tint : 'transparent' },
                    pressed && { opacity: 0.7 },
                    analyzing && { opacity: 0.6 },
                  ]}
                  accessibilityRole="tab"
                  accessibilityLabel={`${mode === 'text' ? 'Text' : 'Photo'} meal analysis`}
                  accessibilityState={{ selected: active, disabled: analyzing }}
                >
                  <ThemedText style={{ color: active ? onTint : textColor, fontWeight: '600' }}>
                    {mode === 'text' ? 'Text' : 'Photo'}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {captureMode === 'text' ? (
            <>
              <TextInput
                value={captureText}
                onChangeText={(value) => { setCaptureText(value); setCaptureError(null); }}
                placeholder="e.g. chicken breast, rice, and broccoli"
                placeholderTextColor={placeholder}
                multiline
                maxLength={1_000}
                editable={!analyzing}
                accessibilityLabel="Meal description"
                style={[
                  styles.input,
                  styles.captureTextInput,
                  { backgroundColor: inputBg, color: textColor, borderColor: border },
                ]}
              />
              <ThemedText style={{ color: placeholder, fontSize: 11, textAlign: 'right', marginBottom: 8 }}>
                {captureText.length}/1000
              </ThemedText>
              <Pressable
                onPress={handleAnalyzeText}
                disabled={analyzing}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: tint },
                  pressed && { opacity: 0.7 },
                  analyzing && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={analyzing ? 'Analyzing meal description' : 'Analyze meal description'}
                accessibilityState={{ disabled: analyzing }}
              >
                {analyzing ? (
                  <ActivityIndicator color={onTint} />
                ) : (
                  <ThemedText style={{ color: onTint, fontWeight: '700' }}>Analyze text</ThemedText>
                )}
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={handleAnalyzePhoto}
              disabled={analyzing}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint },
                pressed && { opacity: 0.7 },
                analyzing && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={analyzing ? 'Analyzing meal photo' : 'Choose and analyze meal photo'}
              accessibilityState={{ disabled: analyzing }}
            >
              {analyzing ? (
                <ActivityIndicator color={onTint} />
              ) : (
                <ThemedText style={{ color: onTint, fontWeight: '700' }}>Choose photo</ThemedText>
              )}
            </Pressable>
          )}
          {captureError && (
            <ThemedText
              accessibilityRole="alert"
              style={{ color: dangerColor, fontSize: 13, marginTop: 8, textAlign: 'center' }}
            >
              {captureError}
            </ThemedText>
          )}
        </View>

        {/* Recently logged */}
        {recentFoods.length > 0 && query.trim().length === 0 && (
          <View style={[styles.card, { backgroundColor: cardBackground, paddingBottom: 8 }]}>
            <ThemedText style={{ fontWeight: '700', marginBottom: 8 }}>Recently logged</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {recentFoods.map((food: RecentFood, idx: number) => (
                  <Pressable
                    key={`${food.food_id ?? food.food_name}-${idx}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${food.food_name}, ${Math.round(food.calories)} calories`}
                    onPress={() => {
                      setSelected({
                        id: food.food_id ?? '',
                        user_id: null,
                        is_global: false,
                        name: food.food_name,
                        brand: null,
                        serving_size_g: 0,
                        serving_label: null,
                        calories: food.calories,
                        protein_g: food.protein_g,
                        carbs_g: food.carbs_g,
                        fat_g: food.fat_g,
                        fiber_g: food.fiber_g,
                        saturated_fat_g: food.saturated_fat_g,
                        sugar_g: 0,
                        sodium_mg: 0,
                        tags: [],
                        created_at: '',
                        updated_at: '',
                      });
                      setSelectedBarcode(null);
                      setScanNotice(null);
                      setServings(String(food.servings));
                      setUnit('serving');
                      setMealSlot(food.meal_slot);
                      setResults([]);
                      setQuery('');
                      setLogError(null);
                    }}
                    style={({ pressed }) => [
                      styles.recentPill,
                      { backgroundColor: cardBackground, borderColor: border },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <ThemedText style={{ fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                      {food.food_name}
                    </ThemedText>
                    <ThemedText style={{ color: placeholder, fontSize: 11 }}>
                      {Math.round(food.calories)} cal
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Search */}
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={{ marginBottom: 10 }}>Search foods</ThemedText>

          {/* Barcode scanning needs a native camera; hidden on web. */}
          {Platform.OS !== 'web' && (
            <Pressable
              onPress={openScanner}
              disabled={lookingUp}
              accessibilityRole="button"
              accessibilityLabel="Scan a barcode"
              accessibilityHint="Opens the camera to scan a product barcode"
              style={({ pressed }) => [
                styles.scanBtn,
                { borderColor: tint, opacity: lookingUp ? 0.6 : 1 },
                pressed && { opacity: 0.7 },
              ]}
            >
              {lookingUp ? (
                <ActivityIndicator color={tint} />
              ) : (
                <>
                  <IconSymbol name="barcode.viewfinder" size={20} color={tint} />
                  <ThemedText style={{ fontWeight: '700', color: tint }}>Scan barcode</ThemedText>
                </>
              )}
            </Pressable>
          )}

          {scanNotice && (
            <ThemedText style={{ color: placeholder, fontSize: 13, marginBottom: 10 }}>
              {scanNotice}
            </ThemedText>
          )}

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. chicken breast"
            placeholderTextColor={placeholder}
            style={[
              styles.input,
              { backgroundColor: inputBg, color: textColor, borderColor: border },
            ]}
            autoCorrect={false}
          />
          {searching && (
            <View style={{ marginTop: 10 }}>
              <ActivityIndicator />
            </View>
          )}
          {results.length > 0 && (
            <View style={{ marginTop: 10 }}>
              {results.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => { setSelected(item); setSelectedBarcode(null); setScanNotice(null); setServings('1'); setUnit('serving'); setResults([]); setQuery(''); setLogError(null); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${Math.round(item.calories)} cal, ${Math.round(item.protein_g)}g protein`}
                  style={({ pressed }) => [
                    styles.resultRow,
                    { borderColor: border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <ThemedText style={{ fontWeight: '600' }}>{item.name}</ThemedText>
                  <ThemedText style={{ color: placeholder, fontSize: 12 }}>
                    {Math.round(item.calories)} cal · {Math.round(item.protein_g)}g protein
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          )}
          {!searching && results.length === 0 && query.trim().length >= 2 && (
            <ThemedText style={{ color: placeholder, marginTop: 8, fontSize: 13 }}>
              No foods found. Try Quick Log below or create a custom food.
            </ThemedText>
          )}
        </View>

        {/* Selected card */}
        {selected && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText type="subtitle" style={{ marginBottom: 8 }}>{selected.name}</ThemedText>
            <ThemedText style={{ color: placeholder, fontSize: 13, marginBottom: 10 }}>
              Per serving: {Math.round(selected.calories)} cal · {Math.round(selected.protein_g)}g/{Math.round(selected.carbs_g)}g/{Math.round(selected.fat_g)}g
            </ThemedText>
            <ThemedText style={{ fontWeight: '600', marginBottom: 6 }}>Amount</ThemedText>
            <TextInput
              value={servings}
              onChangeText={setServings}
              keyboardType="decimal-pad"
              placeholder={unit === 'serving' ? '1' : '100'}
              placeholderTextColor={placeholder}
              style={[
                styles.input,
                { backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 },
              ]}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 8 }}
              contentContainerStyle={{ gap: 6 }}
            >
              {UNITS.map((u) => {
                const needsSize = u.key !== 'serving';
                const disabled = needsSize && !(selected.serving_size_g > 0);
                const active = unit === u.key;
                return (
                  <Pressable
                    key={u.key}
                    onPress={() => { if (!disabled) { setUnit(u.key); setServings(''); } }}
                    style={({ pressed }) => [
                      styles.unitBtn,
                      {
                        backgroundColor: active ? tint : 'transparent',
                        borderColor: active ? tint : border,
                        opacity: disabled ? 0.3 : pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <ThemedText style={{ fontSize: 12, fontWeight: '600', color: active ? onTint : textColor }}>
                      {u.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
            {/* Always disclose what "1 serving" actually weighs — including in
                the `serving` unit, which is the state a barcode scan lands in.
                Hiding it there let a product with a bogus upstream serving size
                (real example: an Oreo listing whose serving_quantity is 3 g)
                render "Per serving: 14 cal" with nothing on screen to reveal
                why. Silent under-reporting is the worst failure a food log has. */}
            {selected.serving_size_g > 0 && (
              <ThemedText style={{ fontSize: 12, color: placeholder, marginBottom: 4 }}>
                1 serving = {selected.serving_size_g}g
                {selected.serving_label ? ` (${selected.serving_label})` : ''}
                {UNITS.find(u => u.key === unit)?.volumetric ? ' · volume is approximate' : ''}
              </ThemedText>
            )}
            <ThemedText style={{ fontSize: 13, color: placeholder, marginBottom: 4 }}>
              Total: {Math.round(selected.calories * servingsNum)} cal · {Math.round(selected.protein_g * servingsNum)}g/{Math.round(selected.carbs_g * servingsNum)}g/{Math.round(selected.fat_g * servingsNum)}g
            </ThemedText>
            <ThemedText style={{ fontWeight: '600', marginTop: 8 }}>Meal</ThemedText>
            {renderSlotPicker(mealSlot, setMealSlot)}
            <Pressable
              onPress={handleLogSelected}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint, marginTop: 4 },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Log food entry"
            >
              {submitting ? (
                <ActivityIndicator color={onTint} />
              ) : (
                <ThemedText style={{ color: onTint, fontWeight: '700' }}>Log</ThemedText>
              )}
            </Pressable>
            {logError && (
              <ThemedText style={{ color: dangerColor, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                {logError}
              </ThemedText>
            )}
          </View>
        )}

        {/* Separator */}
        <View
          onLayout={(e) => { quickLogYRef.current = e.nativeEvent.layout.y; }}
          style={styles.separator}
        >
          <View style={[styles.separatorLine, { backgroundColor: border }]} />
          <ThemedText style={{ color: placeholder, paddingHorizontal: 8, fontSize: 13 }}>
            or log quickly
          </ThemedText>
          <View style={[styles.separatorLine, { backgroundColor: border }]} />
        </View>

        {/* Quick log */}
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={{ marginBottom: 10 }}>Quick log</ThemedText>
          <TextInput
            value={quickName}
            onChangeText={setQuickName}
            placeholder="Food name"
            placeholderTextColor={placeholder}
            style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={quickCal}
              onChangeText={setQuickCal}
              placeholder="Calories"
              placeholderTextColor={placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
            />
            <TextInput
              value={quickProt}
              onChangeText={setQuickProt}
              placeholder="Protein g"
              placeholderTextColor={placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={quickCarb}
              onChangeText={setQuickCarb}
              placeholder="Carbs g"
              placeholderTextColor={placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
            />
            <TextInput
              value={quickFat}
              onChangeText={setQuickFat}
              placeholder="Fat g"
              placeholderTextColor={placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={quickFiber}
              onChangeText={setQuickFiber}
              placeholder="Fiber g (opt)"
              placeholderTextColor={placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
            />
            <TextInput
              value={quickSatFat}
              onChangeText={setQuickSatFat}
              placeholder="Sat fat g (opt)"
              placeholderTextColor={placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
            />
          </View>
          <ThemedText style={{ fontWeight: '600', marginTop: 4 }}>Meal</ThemedText>
          {renderSlotPicker(quickMealSlot, setQuickMealSlot)}
          {quickError && (
            <ThemedText style={{ color: dangerColor, marginBottom: 8, fontSize: 13 }}>
              {quickError}
            </ThemedText>
          )}
          <Pressable
            onPress={handleQuickLog}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: tint, marginTop: 4 },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Log quick entry"
          >
            {quickSubmitting ? (
              <ActivityIndicator color={onTint} />
            ) : (
              <ThemedText style={{ color: onTint, fontWeight: '700' }}>Log</ThemedText>
            )}
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={analysisResult !== null}
        animationType="slide"
        onRequestClose={closeAnalysisReview}
      >
        <ThemedView style={[styles.modalContainer, { backgroundColor }]}>
          <KeyboardAvoidingView
            style={styles.modalContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.modalHeader, { paddingTop: insets.top + 12, borderBottomColor: border }]}>
              <View style={{ flex: 1 }}>
                <ThemedText type="title">Review meal</ThemedText>
                <ThemedText style={{ color: placeholder, fontSize: 13 }}>
                  Edit the estimate before adding it to today&apos;s log.
                </ThemedText>
              </View>
              <Pressable
                onPress={closeAnalysisReview}
                disabled={confirmingAnalysis}
                accessibilityRole="button"
                accessibilityLabel="Close nutrition analysis review"
                accessibilityState={{ disabled: confirmingAnalysis }}
                hitSlop={10}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
              >
                <ThemedText style={{ color: tint, fontWeight: '700' }}>Close</ThemedText>
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                styles.modalScroll,
                { paddingBottom: insets.bottom + 24 },
              ]}
            >
              {reviewItems.map((item, index) => (
                <View
                  key={`review-item-${index}`}
                  style={[styles.reviewRow, { backgroundColor: cardBackground, borderColor: border }]}
                  accessibilityLabel={`Food ${index + 1} of ${reviewItems.length}`}
                >
                  <ThemedText style={styles.reviewRowTitle}>Food {index + 1}</ThemedText>
                  <ThemedText style={styles.fieldLabel}>Food type</ThemedText>
                  <TextInput
                    value={item.food_type}
                    onChangeText={(value) => updateReviewItem(index, 'food_type', value)}
                    maxLength={120}
                    editable={!confirmingAnalysis}
                    placeholder="Food name"
                    placeholderTextColor={placeholder}
                    accessibilityLabel={`Food ${index + 1} type`}
                    style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor: border }]}
                  />

                  <View style={styles.reviewMetricRow}>
                    <View style={styles.reviewMetric}>
                      <ThemedText style={styles.fieldLabel}>Weight (g)</ThemedText>
                      <TextInput
                        value={item.estimated_weight_g}
                        onChangeText={(value) => updateReviewItem(index, 'estimated_weight_g', value)}
                        keyboardType="decimal-pad"
                        editable={!confirmingAnalysis}
                        placeholder="0"
                        placeholderTextColor={placeholder}
                        accessibilityLabel={`Food ${index + 1} estimated weight in grams`}
                        style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor: border }]}
                      />
                    </View>
                    <View style={styles.reviewMetric}>
                      <ThemedText style={styles.fieldLabel}>Calories</ThemedText>
                      <TextInput
                        value={item.estimated_calories}
                        onChangeText={(value) => updateReviewItem(index, 'estimated_calories', value)}
                        keyboardType="decimal-pad"
                        editable={!confirmingAnalysis}
                        placeholder="0"
                        placeholderTextColor={placeholder}
                        accessibilityLabel={`Food ${index + 1} estimated calories`}
                        style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor: border }]}
                      />
                    </View>
                  </View>

                  <ThemedText style={styles.fieldLabel}>Macros (g)</ThemedText>
                  <View style={styles.macroRow}>
                    {([
                      ['protein_g', 'Protein'],
                      ['carbs_g', 'Carbs'],
                      ['fat_g', 'Fat'],
                    ] as const).map(([field, label]) => (
                      <View key={field} style={styles.macroField}>
                        <ThemedText style={{ color: placeholder, fontSize: 11 }}>{label}</ThemedText>
                        <TextInput
                          value={item[field]}
                          onChangeText={(value) => updateReviewItem(index, field, value)}
                          keyboardType="decimal-pad"
                          editable={!confirmingAnalysis}
                          placeholder="0"
                          placeholderTextColor={placeholder}
                          accessibilityLabel={`Food ${index + 1} ${label.toLowerCase()} grams`}
                          style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor: border }]}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              ))}

              <View style={[styles.card, { backgroundColor: cardBackground }]}>
                <ThemedText style={{ fontWeight: '600' }}>Meal</ThemedText>
                {renderSlotPicker(reviewMealSlot, setReviewMealSlot)}
                {reviewError && (
                  <ThemedText
                    accessibilityRole="alert"
                    style={{ color: dangerColor, fontSize: 13, marginBottom: 8 }}
                  >
                    {reviewError}
                  </ThemedText>
                )}
                <Pressable
                  onPress={handleConfirmAnalysis}
                  disabled={confirmingAnalysis}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: tint },
                    pressed && { opacity: 0.7 },
                    confirmingAnalysis && { opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={confirmingAnalysis ? 'Adding nutrition log' : 'Add nutrition log'}
                  accessibilityState={{ disabled: confirmingAnalysis }}
                >
                  {confirmingAnalysis ? (
                    <ActivityIndicator color={onTint} />
                  ) : (
                    <ThemedText style={{ color: onTint, fontWeight: '700' }}>Add log</ThemedText>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </ThemedView>
      </Modal>

      {Platform.OS !== 'web' && (
        <BarcodeScannerModal
          visible={scannerOpen}
          busy={lookingUp}
          onClose={closeScanner}
          onScanned={handleScannedBarcode}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  resultRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  slotBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  separatorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  recentPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 90,
    maxWidth: 140,
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  captureTab: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
  },
  captureTextInput: {
    minHeight: 92,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  reviewRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  reviewRowTitle: {
    fontWeight: '700',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 5,
    marginTop: 8,
  },
  reviewMetricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  reviewMetric: {
    flex: 1,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 8,
  },
  macroField: {
    flex: 1,
  },
});
