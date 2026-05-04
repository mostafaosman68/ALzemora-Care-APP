#!/usr/bin/env python3
"""
Startup assistant for Alzheimer Care App
Checks all dependencies and provides startup instructions
"""

import os
import sys
import subprocess
from pathlib import Path

def check_node_modules():
    """Check if node_modules exists"""
    if not Path("node_modules").exists():
        print("[*] Installing Node.js dependencies...")
        result = subprocess.run(["npm", "install"], capture_output=True)
        if result.returncode != 0:
            print("[ERROR] Failed to install Node dependencies")
            return False
    return True

def check_python_deps():
    """Check if Python dependencies are installed"""
    required = ["flask", "torch", "insightface"]
    missing = []
    
    for pkg in required:
        result = subprocess.run(
            [sys.executable, "-c", f"import {pkg}"],
            capture_output=True
        )
        if result.returncode != 0:
            missing.append(pkg)
    
    if missing:
        print(f"[*] Installing Python dependencies...")
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", "requirements-ml.txt"],
            capture_output=True
        )
        if result.returncode != 0:
            print("[ERROR] Failed to install Python dependencies")
            return False
    
    return True

def setup_ml_service():
    """Setup ML service structure if not exists"""
    if not Path("ml_service").exists():
        print("[*] Setting up ML service structure...")
        result = subprocess.run([sys.executable, "setup_ml.py"], capture_output=True)
        if result.returncode != 0:
            print("[ERROR] Failed to setup ML service")
            return False
    return True

def check_env_file():
    """Check if .env file exists and has ML service config"""
    if not Path(".env").exists():
        print("[!] .env file not found. Using .env.example...")
        with open(".env.example") as f_in, open(".env", "w") as f_out:
            f_out.write(f_in.read())
        print("[!] Created .env from .env.example")
    
    # Check if ML service config is set
    with open(".env") as f:
        content = f.read()
        if "ML_SERVICE_URL" not in content and "ML_SERVICE_HOST" not in content:
            print("[!] ML service config not in .env, adding defaults...")
            with open(".env", "a") as f:
                f.write("\nML_SERVICE_HOST=127.0.0.1\nML_SERVICE_PORT=5000\nML_SERVICE_PATH=/api\n")

def check_voice_model():
    """Check if voice model exists"""
    model_path = Path("../data/pretrained_ecapa_local")
    if not model_path.exists():
        print("[!] Voice model not found at:", model_path)
        print("    You need to place the ECAPA model there manually")
        return False
    return True

def main():
    print("\n" + "="*50)
    print("Alzheimer Care - Startup Assistant")
    print("="*50 + "\n")
    
    # Run checks
    checks = [
        ("Node.js dependencies", check_node_modules),
        ("Python dependencies", check_python_deps),
        ("ML service structure", setup_ml_service),
        (".env configuration", check_env_file),
        ("Voice model", check_voice_model),
    ]
    
    results = []
    for name, check_fn in checks:
        print(f"Checking {name}...", end=" ")
        try:
            result = check_fn()
            results.append(result)
            print("✓" if result else "✗")
        except Exception as e:
            print(f"✗ ({e})")
            results.append(False)
    
    print("\n" + "="*50)
    
    if all(results):
        print("✓ All checks passed!")
    else:
        print("✗ Some checks failed. Please fix issues and try again.")
        return 1
    
    print("\n" + "="*50)
    print("STARTUP INSTRUCTIONS")
    print("="*50 + "\n")
    
    print("Open TWO terminal windows:")
    print()
    print("[Terminal 1] - ML Service (START FIRST):")
    print("  python ml_service/app.py")
    print("  (Wait for 'Starting Flask server...' message)")
    print()
    print("[Terminal 2] - Node Backend:")
    print("  npm run dev")
    print()
    print("Services will be available at:")
    print("  • ML Service:  configured via ML_SERVICE_HOST/PORT/PATH")
    print("  • Backend:     configured via PORT")
    print()
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
