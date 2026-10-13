// OpenAI Chat Completions SSE -> the existing raw UTF-8 coach response.
export function coachTextStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const encoder = new TextEncoder();
    let text = "";
    let cursor = 0;
    let pending = "";
    let data: string[] = [];
    let eventSize = 0;
    let complete = false;
    let eof = false;
    let skipLF = false;
    let cancelled = false;
    let cleanupPromise: Promise<void> | undefined;
    const dispatch = (): string | undefined => {
        if (data.length === 0) return;
        const payload = data.join("\n");
        data = [];
        eventSize = 0;
        if (payload === "[DONE]") {
            complete = true;
            return;
        }
        const json = JSON.parse(payload);
        const object = (value: unknown): value is Record<string, unknown> =>
            value !== null && typeof value === "object" && !Array.isArray(value);
        if (!object(json) || json.error || !Array.isArray(json.choices)) throw new Error("Invalid provider event");
        for (const choice of json.choices) {
            if (!object(choice) || !object(choice.delta)) throw new Error("Invalid provider choice");
            if (choice.finish_reason !== undefined && choice.finish_reason !== null && typeof choice.finish_reason !== "string") {
                throw new Error("Invalid provider finish reason");
            }
            // A token limit cannot certify that safety-critical advice is complete.
            if (choice.finish_reason === "length") throw new Error("Truncated provider response");
            const delta = choice.delta;
            if (delta.role !== undefined && typeof delta.role !== "string") throw new Error("Invalid provider role");
            if (delta.content !== undefined && delta.content !== null && typeof delta.content !== "string") {
                throw new Error("Invalid provider content");
            }
        }
        const content = json.choices[0]?.delta.content;
        return content || undefined;
    };
    const line = (): string | undefined => {
        const value = pending;
        pending = "";
        if (value === "") return dispatch();
        if (value.startsWith("data:")) {
            const part = value.slice(5).replace(/^ /, "");
            eventSize += part.length + 1; // Bound empty data lines as well as payload text.
            if (eventSize > 64 * 1024) throw new Error("Provider event limit exceeded");
            data.push(part);
        }
    };
    const cleanup = () => cleanupPromise ??= (async () => {
        text = "";
        pending = "";
        data = [];
        eventSize = 0;
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    })();
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                while (!complete) {
                    while (cursor < text.length && !complete) {
                        const char = text[cursor++];
                        if (skipLF && char === "\n") { skipLF = false; continue; }
                        skipLF = char === "\r";
                        if (char === "\r" || char === "\n") {
                            const content = line();
                            if (content !== undefined) {
                                controller.enqueue(encoder.encode(content));
                                return; // Resume this chunk only on the next downstream read.
                            }
                        } else {
                            if (pending.length >= 16 * 1024) throw new Error("Provider line limit exceeded");
                            pending += char;
                        }
                    }
                    if (complete) break;
                    text = "";
                    cursor = 0;
                    if (eof) {
                        const content = pending !== "" ? line() : undefined;
                        const tail = dispatch();
                        if (content !== undefined || tail !== undefined) {
                            controller.enqueue(encoder.encode(content ?? tail));
                            return;
                        }
                        if (!complete) throw new Error("Incomplete provider stream");
                        break;
                    }
                    const next = await reader.read();
                    if (cancelled) return;
                    eof = next.done;
                    if (next.value && next.value.byteLength > 256 * 1024) throw new Error("Provider chunk limit exceeded");
                    text = eof ? decoder.decode() : decoder.decode(next.value, { stream: true });
                }
                await cleanup();
                if (!cancelled) controller.close();
            } catch {
                if (!cancelled) {
                    console.error("[coach] openai_stream_error");
                    controller.error(new Error("Coach response interrupted"));
                }
                await cleanup();
            }
        },
        cancel() { cancelled = true; return cleanup(); },
    }, { highWaterMark: 0 });
}
