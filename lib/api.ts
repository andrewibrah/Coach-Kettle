import Constants from "expo-constants";

function resolveApiBase(): string {
  const envBase = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");

  if (__DEV__) {
    const manifest = Constants.manifest as {
      debuggerHost?: string;
      hostUri?: string;
    } | null;
    const manifest2 = Constants.manifest2 as {
      extra?: { expoClient?: { hostUri?: string } };
    } | null;
    const hostUri =
      Constants.expoConfig?.hostUri ??
      manifest?.debuggerHost ??
      manifest?.hostUri ??
      manifest2?.extra?.expoClient?.hostUri;

    if (hostUri) {
      const withoutScheme = hostUri.replace(/^[a-z]+:\/\//i, "");
      const hostPort = withoutScheme.split("/")[0];
      const host = hostPort.split(":")[0];
      if (host) {
        return `http://${host}:8000`;
      }
    }
  }

  throw new Error(
    "EXPO_PUBLIC_API_URL is not set and dev host could not be detected. " +
      "Set EXPO_PUBLIC_API_URL=http://<LAN_IP>:8000 and restart Metro with cache clear."
  );
}

const API_BASE = resolveApiBase();

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.info(`[api] API_BASE=${API_BASE}`);
}

export type ApiWorkoutRow = {
  exercise: string;
  set: number;
  weightLbs: string;
  reps: string;
  notes: string;
};

export type WorkoutSession = {
  id: string;
  dateISO: string;
  part: string;
  rows: ApiWorkoutRow[];
  createdAt: number;
};

// Helper to add timeout to fetch
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  chat: async (message: string, rows: ApiWorkoutRow[]) => {
    const url = `${API_BASE}/chat`;

    if (__DEV__) {
      console.log(`[api] POST ${url}`, { message, rowCount: rows.length });
    }

    let res: Response;

    try {
      res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, rows }),
        },
        30000
      );
    } catch (error: unknown) {
      const err = error as Error;
      if (err.name === "AbortError") {
        throw new Error(
          `Request timed out after 30s. Check if backend is running at ${API_BASE}`
        );
      }
      console.error("[api] Network error:", err);
      throw new Error(
        `Network error: ${err.message}. Make sure backend is running on ${API_BASE}`
      );
    }

    if (!res.ok) {
      const body = await res.text();
      console.error(`[api] HTTP ${res.status}:`, body);
      throw new Error(`Server error ${res.status}: ${body}`);
    }

    const json = await res.json();
    if (__DEV__) {
      console.log("[api] Response:", json);
    }
    return json as { rows: ApiWorkoutRow[] };
  },

  saveWorkout: async (workout: WorkoutSession) => {
    const url = `${API_BASE}/workouts/save`;
    let res: Response;

    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workout }),
      });
    } catch (error) {
      throw new Error(
        [
          `Network request failed for ${url}.`,
          "Make sure FastAPI is running on 0.0.0.0:8000, your phone is on the same Wi-Fi,",
          "and macOS firewall allows inbound on port 8000.",
        ].join(" ")
      );
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status} from ${url}: ${body}`);
    }

    return (await res.json()) as {
      success: boolean;
      workout_id: string;
      rows_saved: number;
    };
  },
};
