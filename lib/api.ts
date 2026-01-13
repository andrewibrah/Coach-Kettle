import Constants from "expo-constants";

function resolveApiBase(): string {
  const envBase = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");

  if (__DEV__) {
    const manifest = Constants.manifest as { debuggerHost?: string; hostUri?: string } | null;
    const manifest2 = Constants.manifest2 as
      | { extra?: { expoClient?: { hostUri?: string } } }
      | null;
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

export type CoachResponse = {
  answer: string;
};

export const api = {
  chat: async (message: string, rows: ApiWorkoutRow[]) => {
    const url = `${API_BASE}/chat`;
    let res: Response;

    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, rows }),
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

    return (await res.json()) as { rows: ApiWorkoutRow[]; answer?: string };
  },
  askCoach: async (question: string, rows: ApiWorkoutRow[]) => {
    const url = `${API_BASE}/coach`;
    let res: Response;

    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, rows }),
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

    return (await res.json()) as CoachResponse;
  },
  parse: async (message: string, lex?: string) => {
    const url = `${API_BASE}/parse`;
    let res: Response;

    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, lastExercise: lex }),
      });
    } catch (error) {
      // Silent fail or throw? Throwing is safer so UI knows backend is down.
      throw new Error(`Parse failed: ${API_BASE} unreachable.`);
    }

    if (!res.ok) {
      throw new Error(`Parse failed: ${res.status}`);
    }

    return (await res.json()) as {
      kind: "fast" | "ai";
      reason?: string;
      rows?: { exercise: string; weightLbs: string; reps: string; notes: string }[];
      userHint?: string;
    };
  },
  saveWorkout: async (session: any) => {
    const url = `${API_BASE}/history`;
    console.log("[api.saveWorkout] Sending to:", url);
    console.log("[api.saveWorkout] Session data:", JSON.stringify(session, null, 2));

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session),
      });
    } catch (error) {
      console.error("[api.saveWorkout] Network error:", error);
      throw new Error(`Network error saving workout: ${error}`);
    }

    console.log("[api.saveWorkout] Response status:", res.status);
    if (!res.ok) {
      const body = await res.text();
      console.error("[api.saveWorkout] Error response:", body);
      throw new Error(`Failed to save workout: ${res.status} - ${body}`);
    }
    console.log("[api.saveWorkout] Save successful");
  },
  getHistory: async () => {
    const url = `${API_BASE}/history`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch history");
    return await res.json();
  },
  deleteWorkout: async (id: string) => {
    const url = `${API_BASE}/history/${id}`;
    await fetch(url, { method: "DELETE" });
  },
  logSet: async (row: ApiWorkoutRow) => {
    const url = `${API_BASE}/log`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row), // Backend should likely handle timestamp/session association separately or we pass it here? 
      // For now, matching USER request "adding an entry... is done on backend" implies a simple log endpoint.
      // If the backend needs session ID, we might need to update this signature. 
      // Assuming stateless log or backend handles active session for now based on context.
    });
  },
};
