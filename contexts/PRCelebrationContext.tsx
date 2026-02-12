import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { PRCelebration, PRCelebrationData } from '@/components/celebration/PRCelebration';

interface PRCelebrationContextType {
  showCelebration: (data: PRCelebrationData) => void;
  hideCelebration: () => void;
}

const PRCelebrationContext = createContext<PRCelebrationContextType>({
  showCelebration: () => {},
  hideCelebration: () => {},
});

export const usePRCelebration = () => useContext(PRCelebrationContext);

export function PRCelebrationProvider({ children }: { children: React.ReactNode }) {
  const [celebrationData, setCelebrationData] = useState<PRCelebrationData | null>(null);
  const [queue, setQueue] = useState<PRCelebrationData[]>([]);

  // Use ref so the callback stays stable (no dependency on celebrationData)
  const celebrationDataRef = useRef<PRCelebrationData | null>(null);
  celebrationDataRef.current = celebrationData;

  const showCelebration = useCallback((data: PRCelebrationData) => {
    if (celebrationDataRef.current) {
      // Queue the celebration if one is already showing
      setQueue((prev) => [...prev, data]);
    } else {
      setCelebrationData(data);
    }
  }, []);

  const hideCelebration = useCallback(() => {
    setCelebrationData(null);
    // Show next in queue if available
    setTimeout(() => {
      setQueue((prev) => {
        if (prev.length > 0) {
          const [next, ...rest] = prev;
          setCelebrationData(next);
          return rest;
        }
        return prev;
      });
    }, 300);
  }, []);

  return (
    <PRCelebrationContext.Provider value={{ showCelebration, hideCelebration }}>
      {children}
      {celebrationData && (
        <PRCelebration data={celebrationData} onDismiss={hideCelebration} />
      )}
    </PRCelebrationContext.Provider>
  );
}
