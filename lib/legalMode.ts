/**
 * Mode resolution for the /terms-of-service route.
 *
 *   /terms-of-service                         -> acceptance gate (Accept / Decline, no Close)
 *   /terms-of-service?doc=terms&mode=read     -> Terms reader (Close only)
 *   /terms-of-service?doc=privacy&mode=read   -> Privacy reader (Close only)
 *
 * The acceptance gate is the safe fallback. The no-param URL is the redirect contract
 * for the tabs gate, sign-in and the auth callback, and those navigate before the
 * AuthLock context has necessarily caught up, so provider state cannot be trusted to
 * downgrade it to a reader. An already-accepted user who lands on the gate is not
 * trapped: Accept re-records idempotently (terms-acceptance maps a duplicate to ok)
 * and Decline signs out. A reader is only granted for one exact, unambiguous value,
 * and never while the user still needs to accept.
 */

export type LegalDoc = 'terms' | 'privacy';
export type LegalMode = 'accept' | 'reader';

type RouteParam = string | string[] | undefined;

const READER_VALUES = new Set(['read', 'reader']);

// Repeated query params arrive as arrays; treat them as malformed rather than guessing.
function single(value: RouteParam): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

export function resolveLegalRoute(
    params: { doc?: RouteParam; mode?: RouteParam },
    state: { needsTermsAcceptance: boolean },
): { mode: LegalMode; doc: LegalDoc } {
    const mode = single(params.mode);
    const doc: LegalDoc = single(params.doc) === 'privacy' ? 'privacy' : 'terms';
    const reader = !state.needsTermsAcceptance && mode !== undefined && READER_VALUES.has(mode);
    return { mode: reader ? 'reader' : 'accept', doc };
}

export function legalDocTitle(doc: LegalDoc): string {
    return doc === 'privacy' ? 'Privacy Policy' : 'Terms of Service';
}

/** A deep-linked reader has no history; fall back to the tabs, whose gates still apply. */
export function closeLegalReader(router: { canGoBack(): boolean; back(): void; replace(href: '/(tabs)'): void }): void {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
}
