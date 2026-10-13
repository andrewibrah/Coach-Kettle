import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithAuth } from './auth';
import { supabaseUrl } from './supabase';
import { classifyOperationResponse, createSessionOperationOutbox } from './sessionOperationOutbox';

const KEY = 'workout_session_operations_v1';
export const sessionOperations = createSessionOperationOutbox({
  read: () => AsyncStorage.getItem(KEY),
  write: value => AsyncStorage.setItem(KEY, value),
  send: async operation => {
    const path = operation.kind === 'delete' ? `history/${encodeURIComponent(operation.sessionId)}` : 'log-set';
    const response = await fetchWithAuth(`${supabaseUrl}/functions/v1/${path}`, {
      method: operation.kind === 'delete' ? 'DELETE' : 'POST',
      body: JSON.stringify(operation.payload),
    }, 1, operation.owner);
    return classifyOperationResponse(response.status, await response.json().catch(() => null));
  },
});
