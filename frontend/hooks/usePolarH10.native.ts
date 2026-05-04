import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

const HEART_RATE_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';
const POLAR_NAME_REGEX = /polar\s*h10|polar/i;

export interface PolarReading {
  bpm: number;
  deviceName: string;
  timestamp: number;
}

interface PolarH10State {
  isScanning: boolean;
  isConnected: boolean;
  deviceName: string | null;
  reading: PolarReading | null;
  error: string | null;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
}

function decodeHeartRateMeasurement(value: string | null | undefined): number | null {
  if (!value) return null;

  const data = Buffer.from(value, 'base64');
  if (data.length < 2) return null;

  const isUint16 = (data[0] & 0x01) === 0x01;
  return isUint16 ? data.readUInt16LE(1) : data.readUInt8(1);
}

async function requestBluetoothPermissions() {
  if (Platform.OS !== 'android') return true;

  if (Platform.Version >= 31) {
    const scan = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
    const connect = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    return scan === PermissionsAndroid.RESULTS.GRANTED && connect === PermissionsAndroid.RESULTS.GRANTED;
  }

  const location = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  return location === PermissionsAndroid.RESULTS.GRANTED;
}

export function usePolarH10(): PolarH10State {
  const managerRef = useRef<BleManager | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const monitorRef = useRef<Subscription | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [reading, setReading] = useState<PolarReading | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopScan = useCallback(() => {
    try {
      managerRef.current?.stopDeviceScan();
    } catch {}

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    setIsScanning(false);
  }, []);

  const disconnect = useCallback(async () => {
    stopScan();

    if (monitorRef.current) {
      monitorRef.current.remove();
      monitorRef.current = null;
    }

    if (deviceRef.current) {
      try {
        await deviceRef.current.cancelConnection();
      } catch {}
      deviceRef.current = null;
    }

    setIsConnected(false);
  }, [stopScan]);

  useEffect(() => {
    return () => {
      void disconnect();
      managerRef.current?.destroy();
      managerRef.current = null;
    };
  }, [disconnect]);

  const connect = useCallback(async () => {
    try {
      setError(null);

      if (Platform.OS === 'web') {
        setError('Bluetooth heart rate monitoring is not supported on web.');
        return false;
      }

      const allowed = await requestBluetoothPermissions();
      if (!allowed) {
        setError('Bluetooth permissions are required to connect to the Polar H10.');
        return false;
      }

      await disconnect();

      try {
        if (!managerRef.current) {
          managerRef.current = new BleManager();
        }
      } catch {
        setError('Bluetooth is unavailable in this app build. Use a custom development build with native BLE support.');
        return false;
      }

      setIsScanning(true);

      return await new Promise<boolean>((resolve) => {
        let settled = false;

        const finish = (value: boolean) => {
          if (settled) return;
          settled = true;
          stopScan();
          resolve(value);
        };

        scanTimeoutRef.current = setTimeout(() => {
          setError('Polar H10 not found. Make sure the sensor is on and nearby.');
          finish(false);
        }, 15000);

        managerRef.current?.startDeviceScan([HEART_RATE_SERVICE_UUID], null, async (scanError, scannedDevice) => {
          if (scanError) {
            setError(scanError.message);
            finish(false);
            return;
          }

          if (!scannedDevice) return;

          const candidateName = scannedDevice.name || scannedDevice.localName || '';
          if (!POLAR_NAME_REGEX.test(candidateName)) return;

          try {
            const connectedDevice = await scannedDevice.connect();
            await connectedDevice.discoverAllServicesAndCharacteristics();

            deviceRef.current = connectedDevice;
            setDeviceName(candidateName || 'Polar H10');
            setIsConnected(true);

            if (scanTimeoutRef.current) {
              clearTimeout(scanTimeoutRef.current);
              scanTimeoutRef.current = null;
            }

            monitorRef.current = connectedDevice.monitorCharacteristicForService(
              HEART_RATE_SERVICE_UUID,
              HEART_RATE_MEASUREMENT_UUID,
              (monitorError, characteristic) => {
                if (monitorError) {
                  setError(monitorError.message);
                  return;
                }

                const bpm = decodeHeartRateMeasurement(characteristic?.value);
                if (!bpm) return;

                const readingDeviceName = candidateName || connectedDevice.name || 'Polar H10';
                setReading({ bpm, deviceName: readingDeviceName, timestamp: Date.now() });
                setDeviceName(readingDeviceName);
              }
            );

            finish(true);
          } catch (connectError: any) {
            setError(connectError?.message || 'Failed to connect to Polar H10.');
            finish(false);
          }
        });
      });
    } catch (unexpectedError: any) {
      setError(unexpectedError?.message || 'Failed to start Bluetooth scanning.');
      return false;
    }
  }, [disconnect, stopScan]);

  return {
    isScanning,
    isConnected,
    deviceName,
    reading,
    error,
    connect,
    disconnect,
  };
}