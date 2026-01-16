// Chat History Storage - Supabase integration with user-scoped data
import { supabase } from './supabase';

export type ChatRole = 'user' | 'assistant';
export type ChatSource = 'workout_chat' | 'coach_modal';

export interface ChatMessage {
    id?: string;
    user_id?: string;
    role: ChatRole;
    content: string;
    source: ChatSource;
    created_at?: string;
}

export interface ChatsByDate {
    date: string; // YYYY-MM-DD
    displayDate: string; // Human readable
    messages: ChatMessage[];
}

const SUPABASE_FUNCTION_URL = 'https://vjfteiuxsdqdozhljxhd.supabase.co/functions/v1';

async function getAuthHeaders(): Promise<HeadersInit> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        throw new Error('Not authenticated');
    }
    return {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
    };
}

/**
 * Sanitize content to prevent XSS and limit length
 */
function sanitizeContent(content: string): string {
    // Limit length to prevent abuse
    const maxLength = 5000;
    const trimmed = content.slice(0, maxLength);
    // Basic sanitization - remove control characters
    return trimmed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Save chat messages to Supabase
 */
export async function saveChatMessages(messages: Omit<ChatMessage, 'id' | 'user_id'>[]): Promise<void> {
    // Validate and sanitize messages
    const sanitizedMessages = messages.map(msg => ({
        ...msg,
        content: sanitizeContent(msg.content),
    }));

    const headers = await getAuthHeaders();

    const response = await fetch(`${SUPABASE_FUNCTION_URL}/chat-history`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: sanitizedMessages }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to save chat messages');
    }
}

/**
 * Fetch chat history for the current user
 */
export async function fetchChatHistory(source?: ChatSource): Promise<ChatMessage[]> {
    const headers = await getAuthHeaders();

    let url = `${SUPABASE_FUNCTION_URL}/chat-history`;
    if (source) {
        url += `?source=${source}`;
    }

    const response = await fetch(url, {
        method: 'GET',
        headers,
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`[fetchChatHistory] Failed: ${response.status} ${text}`);
        let errorMessage = `Failed to fetch chat history (${response.status})`;
        try {
            const json = JSON.parse(text);
            if (json.error) errorMessage = json.error;
        } catch {
            errorMessage += `: ${text}`;
        }
        throw new Error(errorMessage);
    }

    return response.json();
}

/**
 * Delete a chat message
 */
export async function deleteChatMessage(chatId: string): Promise<void> {
    const headers = await getAuthHeaders();

    const response = await fetch(`${SUPABASE_FUNCTION_URL}/chat-history?id=${chatId}`, {
        method: 'DELETE',
        headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to delete chat message');
    }
}

/**
 * Clear all chat history for the current user
 */
export async function clearAllChatHistory(): Promise<void> {
    const headers = await getAuthHeaders();

    const response = await fetch(`${SUPABASE_FUNCTION_URL}/chat-history?clear_all=true`, {
        method: 'DELETE',
        headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to clear chat history');
    }
}

/**
 * Group chat messages by date for UI display
 */
export function groupChatsByDate(messages: ChatMessage[]): ChatsByDate[] {
    const groups = new Map<string, ChatMessage[]>();

    for (const msg of messages) {
        const date = msg.created_at
            ? new Date(msg.created_at).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];

        if (!groups.has(date)) {
            groups.set(date, []);
        }
        groups.get(date)!.push(msg);
    }

    // Convert to array and sort by date ascending (oldest first)
    const result: ChatsByDate[] = [];
    const sortedDates = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));

    for (const date of sortedDates) {
        const messages = groups.get(date)!;
        // Sort messages within each day by time (oldest first for chat flow)
        messages.sort((a, b) => {
            const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return timeA - timeB;
        });

        result.push({
            date,
            displayDate: formatDisplayDate(date),
            messages,
        });
    }

    return result;
}

/**
 * Format date for display
 */
function formatDisplayDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
    });
}

/**
 * Helper to save a Q&A pair from workout chat
 */
export async function saveWorkoutChatQA(question: string, answer: string, timestamp?: number): Promise<void> {
    const baseTime = timestamp || Date.now();
    const questionTime = new Date(baseTime).toISOString();
    const answerTime = new Date(baseTime + 1).toISOString();

    await saveChatMessages([
        { role: 'user', content: question, source: 'workout_chat', created_at: questionTime },
        { role: 'assistant', content: answer, source: 'workout_chat', created_at: answerTime },
    ]);
}

/**
 * Helper to save a Q&A pair from coach modal
 */
export async function saveCoachChatQA(question: string, answer: string, timestamp?: number): Promise<void> {
    const baseTime = timestamp || Date.now();
    const questionTime = new Date(baseTime).toISOString();
    const answerTime = new Date(baseTime + 1).toISOString();

    await saveChatMessages([
        { role: 'user', content: question, source: 'coach_modal', created_at: questionTime },
        { role: 'assistant', content: answer, source: 'coach_modal', created_at: answerTime },
    ]);
}
