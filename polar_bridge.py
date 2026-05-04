"""
Polar H10 → Backend Bridge
---------------------------
Streams heart-rate data to the Alzemora backend so the Heartbeat screen
works in Expo Go (which cannot access BLE directly).

Two modes
  --simulate   Generate random BPM values (no hardware needed)
  (default)    Connect to a real Polar H10 via BLE using `bleak`

Requirements
  pip install bleak requests        # real BLE mode
  pip install requests              # simulate mode only

Usage examples
  # Simulation (no sensor needed)
  python polar_bridge.py --patient-id <PATIENT_ID> --simulate

  # Real Polar H10
  python polar_bridge.py --patient-id <PATIENT_ID>

  # Override API URL or token
  python polar_bridge.py --patient-id <PATIENT_ID> --simulate \
      --api-url http://192.168.1.10:3000 --token my-custom-token
"""

import argparse
import asyncio
import math
import random
import signal
import sys
import time
from datetime import datetime

try:
    import requests
except ImportError:
    print("ERROR: 'requests' is not installed.  Run: pip install requests")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config defaults
# ---------------------------------------------------------------------------
DEFAULT_API_URL = "http://localhost:3000"
DEFAULT_TOKEN = "alzemora-polar-bridge-2026"
POLAR_H10_NAME_PREFIX = "Polar H10"

# Polar H10 BLE UUIDs
HR_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb"
HR_MEASUREMENT_UUID = "00002a37-0000-1000-8000-00805f9b34fb"

# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

def post_reading(api_url: str, token: str, patient_id: str, bpm: int, device_name: str = "Polar H10") -> bool:
    url = f"{api_url}/api/patients/{patient_id}/heartbeat/bridge"
    try:
        r = requests.post(
            url,
            json={"patient_id": patient_id, "bpm": bpm, "device_name": device_name},
            headers={"x-bridge-token": token},
            timeout=5,
        )
        if r.status_code in (200, 201):
            ts = datetime.now().strftime("%H:%M:%S")
            print(f"[{ts}]  {bpm} BPM  →  OK")
            return True
        else:
            print(f"[WARN] Server replied {r.status_code}: {r.text[:120]}")
            return False
    except requests.exceptions.ConnectionError:
        print("[ERROR] Cannot reach backend — is it running?")
        return False
    except Exception as e:
        print(f"[ERROR] {e}")
        return False


# ---------------------------------------------------------------------------
# Simulation mode
# ---------------------------------------------------------------------------

def run_simulation(api_url: str, token: str, patient_id: str, interval: float):
    print(f"[SIM] Simulation mode — sending every {interval}s  (Ctrl-C to stop)")
    t = 0.0
    while True:
        # Smooth sine wave around 72 BPM ± 18
        bpm = int(72 + 18 * math.sin(t) + random.randint(-3, 3))
        bpm = max(40, min(160, bpm))
        post_reading(api_url, token, patient_id, bpm, device_name="Simulated")
        t += 0.4
        time.sleep(interval)


# ---------------------------------------------------------------------------
# Real BLE mode (Polar H10 via bleak)
# ---------------------------------------------------------------------------

async def run_ble(api_url: str, token: str, patient_id: str, interval: float):
    try:
        from bleak import BleakScanner, BleakClient
    except ImportError:
        print("ERROR: 'bleak' is not installed.  Run: pip install bleak")
        sys.exit(1)

    print(f"[BLE] Scanning for {POLAR_H10_NAME_PREFIX}…  (Ctrl-C to stop)")
    device = await BleakScanner.find_device_by_filter(
        lambda d, _: d.name and d.name.startswith(POLAR_H10_NAME_PREFIX),
        timeout=15.0,
    )

    if device is None:
        print(f"ERROR: No device matching '{POLAR_H10_NAME_PREFIX}' found after 15 s.")
        print("       Make sure the strap is wet and the sensor is awake.")
        sys.exit(1)

    print(f"[BLE] Found: {device.name}  ({device.address})")

    last_sent = 0.0

    def hr_handler(_, data: bytearray):
        nonlocal last_sent
        now = time.time()
        if now - last_sent < interval:
            return
        last_sent = now
        # Parse HR Measurement characteristic
        flags = data[0]
        if flags & 0x01:   # 16-bit format
            bpm = int.from_bytes(data[1:3], "little")
        else:              # 8-bit format (typical for Polar H10)
            bpm = data[1]
        post_reading(api_url, token, patient_id, bpm, device_name=device.name)

    async with BleakClient(device) as client:
        print(f"[BLE] Connected.  Streaming heart rate…")
        await client.start_notify(HR_MEASUREMENT_UUID, hr_handler)
        # Keep running until Ctrl-C
        stop = asyncio.Event()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, stop.set)
            except NotImplementedError:
                pass  # Windows doesn't support add_signal_handler for all signals
        try:
            await stop.wait()
        except (KeyboardInterrupt, asyncio.CancelledError):
            pass
        await client.stop_notify(HR_MEASUREMENT_UUID)
        print("[BLE] Disconnected.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Polar H10 → Alzemora backend bridge")
    parser.add_argument("--patient-id", required=True, help="MongoDB _id of the patient record")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help=f"Backend URL (default: {DEFAULT_API_URL})")
    parser.add_argument("--token", default=DEFAULT_TOKEN, help="Bridge token (must match HEARTBEAT_BRIDGE_TOKEN in .env)")
    parser.add_argument("--simulate", action="store_true", help="Use simulated BPM values instead of a real sensor")
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between readings (default: 2)")
    args = parser.parse_args()

    print("=" * 55)
    print("  Alzemora Heartbeat Bridge")
    print(f"  API:       {args.api_url}")
    print(f"  Patient:   {args.patient_id}")
    print(f"  Interval:  {args.interval}s")
    print(f"  Mode:      {'SIMULATION' if args.simulate else 'Polar H10 BLE'}")
    print("=" * 55)

    if args.simulate:
        try:
            run_simulation(args.api_url, args.token, args.patient_id, args.interval)
        except KeyboardInterrupt:
            print("\n[EXIT] Stopped.")
    else:
        try:
            asyncio.run(run_ble(args.api_url, args.token, args.patient_id, args.interval))
        except KeyboardInterrupt:
            print("\n[EXIT] Stopped.")


if __name__ == "__main__":
    main()
