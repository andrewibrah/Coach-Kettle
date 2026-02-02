const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = {
  chat: async (message: string) => {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return (await res.json()) as { reply: string };
  },
};
