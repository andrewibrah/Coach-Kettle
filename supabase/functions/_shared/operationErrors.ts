// Maps apply_workout_operation failures to HTTP. RAISE EXCEPTION (P0001) is a deterministic
// rejection of this exact operation, so retrying can never succeed: 409 with a stable code.
// The RPC's 42501 ownership/auth rejections: 403. Anything else (connection, timeout, unknown) is
// returned as null so the caller keeps its transient 500. Raw SQL text is never echoed.
const STABLE: Record<string, string> = {
  'Session finalized': 'session_finalized',
  'Session deleted': 'session_deleted',
  'Operation key payload conflict': 'operation_conflict',
  'Stale session revision': 'stale_revision',
  'Legacy or foreign session identity': 'legacy_session',
};

const OWNERSHIP = new Set(['Session ownership required', 'Authentication required']);

export function operationRejection(error: { code?: string; message?: string } | null | undefined):
  { status: number; body: { error: string; code: string } } | null {
  // Only the RPC's own ownership/auth rejections; any other 42501 (e.g. a misdeployed grant)
  // is an infrastructure fault and stays a transient 500.
  if (error?.code === '42501' && OWNERSHIP.has(error.message ?? '')) {
    return { status: 403, body: { error: 'Operation not allowed', code: 'forbidden' } };
  }
  if (error?.code === 'P0001') {
    return { status: 409, body: { error: 'Operation rejected', code: STABLE[error.message ?? ''] ?? 'invalid_operation' } };
  }
  return null;
}
