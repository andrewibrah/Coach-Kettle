// Pure Open Food Facts → Coach Kettle food mapping.
//
// Deliberately has ZERO imports so that it runs unchanged under Deno (the
// food-barcode Edge Function) and under the Node test runner. `tsconfig.json`
// excludes `supabase/functions/**` from `tsc`, so `lib/__tests__/openFoodFacts.test.ts`
// is the only type/behaviour coverage this file gets — keep it in sync.
//
// Field semantics verified against the live v2 API on 2026-09-06:
//   • nutriments.*_100g are per 100 g (or per 100 ml — see nutrition_data_per)
//   • sodium_100g and salt_100g are in GRAMS, while foods.sodium_mg is mg
//   • energy-kcal_100g of 0 is legitimate (Diet Coke), NOT missing data
//   • fiber_100g is frequently absent
//   • serving_quantity is often absent; serving_size is free text

export interface BarcodeFood {
    barcode: string;
    name: string;
    brand: string | null;
    /** Grams in one serving. Never 0 — falls back to a 100 g basis. */
    serving_size_g: number;
    serving_label: string | null;
    /** All macro values below are per ONE serving (i.e. per serving_size_g). */
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    saturated_fat_g: number;
    sugar_g: number;
    sodium_mg: number;
    /** What the source data was expressed per, for UI disclosure. */
    basis: "100g" | "100ml" | "serving";
}

export type MappedBarcodeProduct =
    | { status: "found"; food: BarcodeFood }
    | { status: "incomplete"; name: string | null; brand: string | null };

/** Upper bounds mirror the CHECK constraints on public.foods (migration 0033). */
const LIMITS = {
    calories: 10_000,
    protein_g: 500,
    carbs_g: 1_000,
    fat_g: 500,
    fiber_g: 200,
    saturated_fat_g: 300,
    sugar_g: 500,
    sodium_mg: 20_000,
} as const;

/**
 * Smallest serving size we are willing to believe.
 *
 * Not a "greater than zero" guard — a plausibility guard. Community-entered
 * serving sizes are frequently corrupt: a real Oreo listing (0044000032029)
 * declares `serving_quantity: 3` grams against a 471 kcal/100 g product, which
 * would log a whole serving of cookies as 14 calories. Below this floor we fall
 * back to the source's OWN declared basis (per 100 g/ml), which is the field
 * the nutrition values are actually expressed in, and let the user set the
 * amount against a unit they recognize.
 */
const MIN_PLAUSIBLE_SERVING_G = 5;
const MAX_SERVING_G = 5_000;

function num(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

/** Non-negative finite number, or `fallback` when absent/invalid. Zero is preserved. */
function nonNegative(value: unknown, fallback: number): number {
    const parsed = num(value);
    if (parsed === null || parsed < 0) return fallback;
    return parsed;
}

function clamp(value: number, max: number): number {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.min(Math.round(value * 100) / 100, max);
}

function text(value: unknown, maxLength: number): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, maxLength);
}

/** OFF `brands` is a comma-separated list; the first entry is the primary brand. */
function primaryBrand(value: unknown): string | null {
    const raw = text(value, 400);
    if (!raw) return null;
    return text(raw.split(",")[0], 120);
}

function productName(product: Record<string, unknown>): string | null {
    return (
        text(product.product_name, 200) ??
        text(product.product_name_en, 200) ??
        text(product.generic_name, 200) ??
        text(product.generic_name_en, 200)
    );
}

/**
 * Calories per 100 units. Prefers the explicit kcal field; falls back to the
 * kJ field (OFF always carries at least one when nutrition data exists).
 * Returns null ONLY when energy is genuinely absent — a value of 0 is real.
 */
function energyKcalPer100(nutriments: Record<string, unknown>): number | null {
    const kcal = num(nutriments["energy-kcal_100g"]);
    if (kcal !== null && kcal >= 0) return kcal;

    const kj = num(nutriments["energy-kj_100g"]);
    if (kj !== null && kj >= 0) return kj / 4.184;

    // `energy_100g` is ALWAYS kJ. `energy_unit` describes the unit the
    // contributor typed for `energy_value`, NOT the unit of `energy_100g` —
    // verified on three products where energy_unit was "kJ" and
    // energy_100g === energy-kj_100g exactly. Branching on energy_unit here
    // would over-report by 4.184x for any product entered in kcal.
    const generic = num(nutriments.energy_100g);
    if (generic !== null && generic >= 0) return generic / 4.184;

    return null;
}

/**
 * Sodium in MILLIGRAMS per 100 units. OFF reports sodium and salt in grams;
 * getting this wrong is a silent 1000x error. Salt → sodium uses the standard
 * 2.5 factor (NaCl molar mass ratio).
 */
function sodiumMgPer100(nutriments: Record<string, unknown>): number {
    const sodiumG = num(nutriments.sodium_100g);
    if (sodiumG !== null && sodiumG >= 0) return sodiumG * 1000;

    const saltG = num(nutriments.salt_100g);
    if (saltG !== null && saltG >= 0) return (saltG * 1000) / 2.5;

    return 0;
}

/**
 * Grams in one serving, plus how to label it.
 *
 * CRITICAL: never returns 0. `toServings()` in the log screen silently treats a
 * serving size of 0 as "1 serving", which would make every gram/oz amount the
 * user types log the wrong number of calories. Absent serving data falls back
 * to an explicit 100 g/ml basis, which is exactly what the source data is per.
 */
function resolveServing(
    product: Record<string, unknown>,
    basis: "100g" | "100ml",
): { grams: number; label: string; isPerServing: boolean } {
    const quantity = num(product.serving_quantity);
    const unit = typeof product.serving_quantity_unit === "string"
        ? product.serving_quantity_unit.trim().toLowerCase()
        : "";

    // Only mass/volume units convert; anything else (e.g. "portion") is unusable.
    const usableUnit = unit === "" || unit === "g" || unit === "ml";

    if (
        quantity !== null && quantity >= MIN_PLAUSIBLE_SERVING_G &&
        quantity <= MAX_SERVING_G && usableUnit
    ) {
        const label = text(product.serving_size, 60)
            ?? `${Math.round(quantity * 100) / 100} ${unit || (basis === "100ml" ? "ml" : "g")}`;
        return { grams: Math.round(quantity * 100) / 100, label, isPerServing: true };
    }

    return {
        grams: 100,
        label: basis === "100ml" ? "100 ml" : "100 g",
        isPerServing: false,
    };
}

/**
 * Map one OFF v2 `product` object onto a loggable food.
 *
 * Returns `incomplete` (rather than a zeroed-out food) when the product has no
 * usable name or no energy data at all, so the caller can route the user to
 * prefilled manual entry instead of logging silently wrong macros.
 */
export function mapOpenFoodFactsProduct(
    barcode: string,
    rawProduct: unknown,
): MappedBarcodeProduct {
    if (typeof rawProduct !== "object" || rawProduct === null) {
        return { status: "incomplete", name: null, brand: null };
    }
    const product = rawProduct as Record<string, unknown>;

    const name = productName(product);
    const brand = primaryBrand(product.brands);

    const rawNutriments = product.nutriments;
    const nutriments = (typeof rawNutriments === "object" && rawNutriments !== null)
        ? rawNutriments as Record<string, unknown>
        : {};

    const kcalPer100 = energyKcalPer100(nutriments);
    if (!name || kcalPer100 === null) {
        return { status: "incomplete", name, brand };
    }

    const perUnit = typeof product.nutrition_data_per === "string"
        ? product.nutrition_data_per.toLowerCase()
        : "";
    const basis: "100g" | "100ml" = perUnit.includes("ml") ? "100ml" : "100g";

    const serving = resolveServing(product, basis);
    // Source values are per 100 units; scale them onto one serving.
    const scale = serving.grams / 100;

    return {
        status: "found",
        food: {
            barcode,
            name,
            brand,
            serving_size_g: serving.grams,
            serving_label: serving.label,
            calories: clamp(kcalPer100 * scale, LIMITS.calories),
            protein_g: clamp(nonNegative(nutriments.proteins_100g, 0) * scale, LIMITS.protein_g),
            carbs_g: clamp(nonNegative(nutriments.carbohydrates_100g, 0) * scale, LIMITS.carbs_g),
            fat_g: clamp(nonNegative(nutriments.fat_100g, 0) * scale, LIMITS.fat_g),
            fiber_g: clamp(nonNegative(nutriments.fiber_100g, 0) * scale, LIMITS.fiber_g),
            saturated_fat_g: clamp(
                nonNegative(nutriments["saturated-fat_100g"], 0) * scale,
                LIMITS.saturated_fat_g,
            ),
            sugar_g: clamp(nonNegative(nutriments.sugars_100g, 0) * scale, LIMITS.sugar_g),
            sodium_mg: clamp(sodiumMgPer100(nutriments) * scale, LIMITS.sodium_mg),
            basis: serving.isPerServing ? "serving" : basis,
        },
    };
}
