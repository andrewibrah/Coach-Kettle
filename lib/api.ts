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

    return (await res.json()) as { rows: ApiWorkoutRow[] };
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
};
