import { useCallback, useState } from 'react';

export interface PolarReading {
  bpm: number;
  deviceName: string;
  timestamp: number;
}

export function usePolarH10() {
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setError('Bluetooth heart rate monitoring is not supported on web.');
    return false;
  }, []);

  const disconnect = useCallback(async () => {
    return;
  }, []);

  return {
    isScanning: false,
    isConnected: false,
    deviceName: null as string | null,
    reading: null as PolarReading | null,
    error,
    connect,
    disconnect,
  };
}