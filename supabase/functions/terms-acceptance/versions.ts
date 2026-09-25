// Versions the terms-acceptance gate requires, and the check itself.
// Pure (no Deno or URL imports) so node:test can import it next to the client's
// constants/legal.ts and prove the two agree.

// Update these when the ToS / Privacy Policy changes (and constants/legal.ts with them).
export const CURRENT_TERMS_VERSION = "1.0.0";
export const CURRENT_PRIVACY_VERSION = "1.1.0";

// Live 1.0.1 builds record the terms version as the privacy version and never
// declare a privacy version on GET, so the most they can ever store is "1.0.0".
// A GET without a declaration keeps requiring only that; requiring 1.1.0 there
// would re-prompt those users on every launch with no way to satisfy it.
export const LEGACY_PRIVACY_VERSION = "1.0.0";

export interface AcceptanceRow {
    terms_version: string;
    privacy_version: string;
    accepted_at: string;
}

type Version = [number, number, number];

function parseVersion(value: unknown): Version | null {
    if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) return null;
    const [major, minor, patch] = value.split(".").map(Number);
    return [major, minor, patch];
}

function compareVersions(a: Version, b: Version): number {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
}

/**
 * The privacy version a client has to have accepted, given what it declared
 * (the `privacy_version` query param on GET).
 *   no declaration  -> LEGACY (1.0.1 builds)
 *   malformed       -> CURRENT (fail closed)
 *   otherwise       -> the declaration, clamped to [LEGACY, CURRENT]
 */
export function requiredPrivacyVersion(declared: string | null | undefined): string {
    if (declared === null || declared === undefined || declared === "") return LEGACY_PRIVACY_VERSION;
    const parsed = parseVersion(declared);
    if (!parsed) return CURRENT_PRIVACY_VERSION;
    if (compareVersions(parsed, parseVersion(CURRENT_PRIVACY_VERSION)!) >= 0) return CURRENT_PRIVACY_VERSION;
    if (compareVersions(parsed, parseVersion(LEGACY_PRIVACY_VERSION)!) <= 0) return LEGACY_PRIVACY_VERSION;
    return declared;
}

function satisfiesPrivacy(accepted: unknown, required: string): boolean {
    const parsed = parseVersion(accepted);
    return parsed !== null && compareVersions(parsed, parseVersion(required)!) >= 0;
}

/**
 * Accepted when ANY stored row has the current terms and a privacy version at or
 * above the requirement. Checking only the latest row would trap a user whose two
 * devices (1.0.1 and 1.0.2) write different privacy versions: a re-accept of an
 * existing pair is a unique-constraint no-op, so it never becomes the latest row.
 * `rows` is expected newest first.
 */
export function evaluateAcceptance(rows: AcceptanceRow[], declared: string | null | undefined): {
    accepted: boolean;
    requiredPrivacyVersion: string;
    matching: AcceptanceRow | null;
    latest: AcceptanceRow | null;
} {
    const required = requiredPrivacyVersion(declared);
    const matching = rows.find((row) =>
        row.terms_version === CURRENT_TERMS_VERSION && satisfiesPrivacy(row.privacy_version, required)
    ) ?? null;
    return { accepted: matching !== null, requiredPrivacyVersion: required, matching, latest: rows[0] ?? null };
}
