"""
Multimodal Face + Voice Recognition Flask Service
Handles face and voice embedding extraction and recognition
"""

import os
import json
import traceback
import re
from pathlib import Path
import numpy as np
import cv2
import torch
import torch.nn.functional as F
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import pyaudio
from collections import deque

# ML imports
from insightface.app import FaceAnalysis
from speechbrain.lobes.models.ECAPA_TDNN import ECAPA_TDNN
import yaml

# ==========================================
# ⚙️ CONFIGURATION
# ==========================================
app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(BASE_DIR)
DATA_DIR = os.path.join(PARENT_DIR, '..', 'data')

FACE_MODEL_PATH = "buffalo_s"
VOICE_MODEL_PATH = os.path.join(PARENT_DIR, "..", "data", "pretrained_ecapa_local")

# Recognition thresholds
FACE_THRESHOLD = 0.40
VOICE_THRESHOLD = 0.45
FUSION_THRESHOLD = 0.55
FUSION_MIN_FACE_SCORE = 0.35
FUSION_MIN_VOICE_SCORE = 0.40

# Fusion weights
W_FACE = 0.70
W_VOICE = 0.30
CONFLICT_PENALTY = 0.80

# Audio config
RATE = 16000

# ==========================================
# 🧠 GLOBAL STATE
# ==========================================
face_app = None
voice_model = None
voice_fbank = None
voice_fbank_mode = None

# In-memory embeddings (for this session)
embeddings_cache = {
    "faces": {},    # {person_name: embedding_array}
    "voices": {}    # {person_name: embedding_array}
}


# ==========================================
# 🔀 UTILITY FUNCTIONS
# ==========================================
def normalize_score(raw_cosine: float) -> float:
    """Normalize cosine similarity from [-1, 1] to [0, 1]"""
    return (raw_cosine + 1.0) / 2.0


def fuse(face_person, face_raw_score, face_active,
         voice_person, voice_raw_score, voice_active):
    """Fuse face and voice recognition results"""
    f_norm = normalize_score(face_raw_score) if face_active else 0.0
    v_norm = normalize_score(voice_raw_score) if voice_active else 0.0

    face_valid = face_active and face_raw_score >= FUSION_MIN_FACE_SCORE
    voice_valid = voice_active and voice_raw_score >= FUSION_MIN_VOICE_SCORE

    if face_valid and voice_valid:
        conflict = (
            face_person != voice_person
            and face_person != "Unknown"
            and voice_person != "Unknown"
        )

        face_boost = 1.0 - (v_norm * W_VOICE)
        w_f = min(W_FACE + (1.0 - W_FACE - W_VOICE) * face_boost, 1.0)
        fused = w_f * f_norm + (1.0 - w_f) * v_norm

        if conflict:
            fused *= CONFLICT_PENALTY
            identity = face_person
            mode = "speaker_not_visible"
        else:
            identity = face_person if face_person != "Unknown" else voice_person
            mode = "face+voice"

    elif face_valid:
        fused = f_norm
        identity = face_person
        conflict = False
        mode = "face_only"

    elif voice_valid:
        fused = v_norm
        identity = voice_person
        conflict = False
        mode = "voice_only"

    else:
        fused = max(f_norm, v_norm)
        identity = "Unknown"
        conflict = False
        mode = "unknown"

    if fused < FUSION_THRESHOLD and identity != "Unknown":
        identity = "Unknown"

    return {
        "identity": identity,
        "fused_score": round(fused, 4),
        "mode": mode,
        "conflict": conflict,
        "face_norm": round(f_norm, 4),
        "voice_norm": round(v_norm, 4),
    }


# ==========================================
# 🎙️ VOICE MODEL LOADING
# ==========================================
def load_ecapa_from_ckpt(model_path: str):
    """Load a local SpeechBrain ECAPA model without from_hparams()"""
    hp_file = os.path.join(model_path, "hyperparams.yaml")
    if not os.path.exists(hp_file):
        raise FileNotFoundError(f"hyperparams.yaml not found in {model_path}")

    with open(hp_file, "r", encoding="utf-8") as f:
        raw = f.read()

    class IgnoreUnknownLoader(yaml.SafeLoader):
        pass

    def ignore_unknown(loader, tag_suffix, node):
        if isinstance(node, yaml.ScalarNode):
            return loader.construct_scalar(node)
        elif isinstance(node, yaml.SequenceNode):
            return loader.construct_sequence(node)
        elif isinstance(node, yaml.MappingNode):
            return loader.construct_mapping(node)
        return None

    IgnoreUnknownLoader.add_multi_constructor("", ignore_unknown)
    hp = yaml.load(raw, Loader=IgnoreUnknownLoader)

    emb_dim = int(hp.get("emb_dim", 192))
    n_mels = int(hp.get("n_mels", 80))
    channels = hp.get("channels", [1024, 1024, 1024, 1024, 3072])
    kernel_sizes = hp.get("kernel_sizes", [5, 3, 3, 3, 1])
    dilations = hp.get("dilations", [1, 2, 3, 4, 1])

    model = ECAPA_TDNN(
        input_size=n_mels,
        channels=channels,
        kernel_sizes=kernel_sizes,
        dilations=dilations,
        lin_neurons=emb_dim,
    )

    ckpt = os.path.join(model_path, "embedding_model.ckpt")
    if not os.path.exists(ckpt):
        raise FileNotFoundError(
            f"embedding_model.ckpt not found in {model_path}. "
            f"Found: {os.listdir(model_path)}"
        )

    state = torch.load(ckpt, map_location="cpu")

    if isinstance(state, dict):
        if "state_dict" in state:
            candidate_state = state["state_dict"]
        elif "model" in state:
            candidate_state = state["model"]
        elif "embedding_model" in state:
            candidate_state = state["embedding_model"]
        else:
            candidate_state = state
    else:
        candidate_state = state

    try:
        model.load_state_dict(candidate_state, strict=True)
    except Exception as e1:
        cleaned = {}
        for k, v in candidate_state.items():
            nk = k
            if nk.startswith("embedding_model."):
                nk = nk[len("embedding_model."):]
            if nk.startswith("module."):
                nk = nk[len("module."):]
            cleaned[nk] = v

        try:
            model.load_state_dict(cleaned, strict=True)
        except Exception as e2:
            raise RuntimeError(f"Could not load ECAPA model. Error: {e2}")

    model.eval()
    return model, n_mels


def build_fbank(n_mels):
    """Build feature extraction (Fbank)"""
    try:
        from speechbrain.lobes.features import Fbank
        return Fbank(n_mels=n_mels), "speechbrain"
    except Exception:
        import torchaudio
        return torchaudio.transforms.MelSpectrogram(
            sample_rate=RATE,
            n_fft=400,
            hop_length=160,
            n_mels=n_mels,
        ), "torchaudio"


# ==========================================
# 🎬 INITIALIZATION
# ==========================================
def initialize_models():
    """Initialize face and voice models on startup"""
    global face_app, voice_model, voice_fbank, voice_fbank_mode

    try:
        print("[Init] Loading face model...")
        face_app = FaceAnalysis(name=FACE_MODEL_PATH)
        face_app.prepare(ctx_id=0, det_size=(640, 640))
        print("[Init] ✅ Face model loaded")
    except Exception as e:
        print(f"[Init] ❌ Face model error: {e}")

    try:
        if os.path.exists(VOICE_MODEL_PATH):
            print("[Init] Loading voice model...")
            voice_model, n_mels = load_ecapa_from_ckpt(VOICE_MODEL_PATH)
            voice_fbank, voice_fbank_mode = build_fbank(n_mels)
            print(f"[Init] ✅ Voice model loaded (Fbank: {voice_fbank_mode})")
        else:
            print(f"[Init] ⚠️ Voice model path not found: {VOICE_MODEL_PATH}")
    except Exception as e:
        print(f"[Init] ❌ Voice model error: {e}")


# ==========================================
# 📸 FACE RECOGNITION ENDPOINTS
# ==========================================
@app.route('/api/extract_face_embedding', methods=['POST'])
def extract_face_embedding():
    """Extract face embedding from image file"""
    try:
        if not face_app:
            return jsonify({"error": "Face model not loaded"}), 503

        if 'image' not in request.files:
            return jsonify({"error": "Image file required"}), 400

        file = request.files['image']
        img = Image.open(file.stream).convert("RGB")
        frame = np.array(img)

        faces = face_app.get(frame)
        if not faces:
            return jsonify({"error": "No face detected"}), 400

        # Return first face embedding
        embedding = faces[0].embedding.tolist()
        return jsonify({
            "embedding": embedding,
            "num_faces": len(faces)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/register_face', methods=['POST'])
def register_face():
    """Register a face for a person (store embedding)"""
    try:
        if not face_app:
            return jsonify({"error": "Face model not loaded"}), 503

        data = request.get_json()
        person_name = data.get('person_name')
        embedding = data.get('embedding')

        if not person_name or not embedding:
            return jsonify({"error": "person_name and embedding required"}), 400

        embeddings_cache["faces"][person_name] = np.array(embedding)
        return jsonify({"message": f"Face registered for {person_name}"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/recognize_face', methods=['POST'])
def recognize_face():
    """Recognize a face from image"""
    try:
        if not face_app:
            return jsonify({"error": "Face model not loaded"}), 503

        if 'image' not in request.files:
            return jsonify({"error": "Image file required"}), 400

        if not embeddings_cache["faces"]:
            return jsonify({"recognized": False, "message": "No registered faces"}), 400

        file = request.files['image']
        img = Image.open(file.stream).convert("RGB")
        frame = np.array(img)

        faces = face_app.get(frame)
        if not faces:
            return jsonify({"recognized": False, "message": "No face detected"}), 400

        # Get first face
        face = faces[0]
        emb = face.embedding

        # Compare with registered faces
        best_person, best_score = "Unknown", -1.0
        for person, db_emb in embeddings_cache["faces"].items():
            score = float(
                np.dot(emb, db_emb)
                / (np.linalg.norm(emb) * np.linalg.norm(db_emb) + 1e-9)
            )
            if score > best_score:
                best_score = score
                best_person = person

        if best_score >= FACE_THRESHOLD:
            return jsonify({
                "recognized": True,
                "person": best_person,
                "score": round(best_score, 4),
                "raw_score": round(best_score, 4)
            })
        else:
            return jsonify({
                "recognized": False,
                "message": "Unknown face",
                "person": "Unknown",
                "score": round(best_score, 4)
            })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================
# 🎙️ VOICE RECOGNITION ENDPOINTS
# ==========================================
@app.route('/api/extract_voice_embedding', methods=['POST'])
def extract_voice_embedding():
    """Extract voice embedding from audio file"""
    try:
        if not voice_model:
            return jsonify({"error": "Voice model not loaded"}), 503

        if 'audio' not in request.files:
            return jsonify({"error": "Audio file required"}), 400

        file = request.files['audio']
        
        # Read audio file (assume WAV for now)
        import scipy.io.wavfile as wavfile
        import io
        
        audio_data = file.read()
        rate, pcm = wavfile.read(io.BytesIO(audio_data))
        
        # Convert to mono if stereo
        if len(pcm.shape) > 1:
            pcm = pcm[:, 0]
        
        # Normalize and resample if needed
        pcm = pcm.astype(np.float32) / 32768.0
        
        if rate != RATE:
            # Resample
            from scipy.signal import resample
            num_samples = int(len(pcm) * RATE / rate)
            pcm = resample(pcm, num_samples)
        
        audio_tensor = torch.from_numpy(pcm).unsqueeze(0).float()
        
        with torch.no_grad():
            feats = voice_fbank(audio_tensor)
            
            if voice_fbank_mode == "torchaudio":
                feats = feats.transpose(1, 2)
            
            emb = voice_model(feats)
            embedding = F.normalize(emb, dim=1).squeeze(0).cpu().numpy().tolist()
        
        return jsonify({
            "embedding": embedding,
            "duration": len(pcm) / RATE
        })

    except Exception as e:
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


@app.route('/api/register_voice', methods=['POST'])
def register_voice():
    """Register a voice for a person"""
    try:
        data = request.get_json()
        person_name = data.get('person_name')
        embedding = data.get('embedding')

        if not person_name or not embedding:
            return jsonify({"error": "person_name and embedding required"}), 400

        embeddings_cache["voices"][person_name] = np.array(embedding)
        return jsonify({"message": f"Voice registered for {person_name}"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/recognize_voice', methods=['POST'])
def recognize_voice():
    """Recognize a voice from audio"""
    try:
        if not voice_model:
            return jsonify({"error": "Voice model not loaded"}), 503

        if 'audio' not in request.files:
            return jsonify({"error": "Audio file required"}), 400

        if not embeddings_cache["voices"]:
            return jsonify({"recognized": False, "message": "No registered voices"}), 400

        file = request.files['audio']
        
        # Read audio
        import scipy.io.wavfile as wavfile
        import io
        
        audio_data = file.read()
        rate, pcm = wavfile.read(io.BytesIO(audio_data))
        
        if len(pcm.shape) > 1:
            pcm = pcm[:, 0]
        
        pcm = pcm.astype(np.float32) / 32768.0
        
        if rate != RATE:
            from scipy.signal import resample
            num_samples = int(len(pcm) * RATE / rate)
            pcm = resample(pcm, num_samples)
        
        audio_tensor = torch.from_numpy(pcm).unsqueeze(0).float()
        audio_tensor = audio_tensor / (audio_tensor.abs().max() + 1e-9)
        
        with torch.no_grad():
            feats = voice_fbank(audio_tensor)
            
            if voice_fbank_mode == "torchaudio":
                feats = feats.transpose(1, 2)
            
            emb = voice_model(feats)
            emb = F.normalize(emb, dim=1).squeeze(0)
        
        # Compare with registered voices
        best_person, best_score = "Unknown", -1.0
        for person, db_emb in embeddings_cache["voices"].items():
            db_emb_tensor = torch.from_numpy(db_emb).float()
            score = torch.dot(emb, db_emb_tensor).item()
            if score > best_score:
                best_score = score
                best_person = person
        
        if best_score >= VOICE_THRESHOLD:
            return jsonify({
                "recognized": True,
                "person": best_person,
                "score": round(best_score, 4),
                "raw_score": round(best_score, 4)
            })
        else:
            return jsonify({
                "recognized": False,
                "message": "Unknown voice",
                "person": "Unknown",
                "score": round(best_score, 4)
            })

    except Exception as e:
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ==========================================
# 🔀 MULTIMODAL FUSION ENDPOINT
# ==========================================
@app.route('/api/recognize_multimodal', methods=['POST'])
def recognize_multimodal():
    """Recognize using both face and voice (fusion)"""
    try:
        has_image = 'image' in request.files
        has_audio = 'audio' in request.files

        face_result = {"active": False, "person": "Unknown", "raw_score": 0.0}
        voice_result = {"active": False, "person": "Unknown", "raw_score": 0.0}

        # Extract face embedding if provided
        if has_image and face_app and embeddings_cache["faces"]:
            try:
                file = request.files['image']
                img = Image.open(file.stream).convert("RGB")
                frame = np.array(img)
                
                faces = face_app.get(frame)
                if faces:
                    emb = faces[0].embedding
                    best_person, best_score = "Unknown", -1.0
                    for person, db_emb in embeddings_cache["faces"].items():
                        score = float(
                            np.dot(emb, db_emb)
                            / (np.linalg.norm(emb) * np.linalg.norm(db_emb) + 1e-9)
                        )
                        if score > best_score:
                            best_score = score
                            best_person = person
                    
                    face_result["active"] = True
                    face_result["person"] = best_person
                    face_result["raw_score"] = best_score
            except Exception as e:
                print(f"Face recognition error: {e}")

        # Extract voice embedding if provided
        if has_audio and voice_model and embeddings_cache["voices"]:
            try:
                import scipy.io.wavfile as wavfile
                import io
                
                file = request.files['audio']
                audio_data = file.read()
                rate, pcm = wavfile.read(io.BytesIO(audio_data))
                
                if len(pcm.shape) > 1:
                    pcm = pcm[:, 0]
                
                pcm = pcm.astype(np.float32) / 32768.0
                
                if rate != RATE:
                    from scipy.signal import resample
                    num_samples = int(len(pcm) * RATE / rate)
                    pcm = resample(pcm, num_samples)
                
                audio_tensor = torch.from_numpy(pcm).unsqueeze(0).float()
                audio_tensor = audio_tensor / (audio_tensor.abs().max() + 1e-9)
                
                with torch.no_grad():
                    feats = voice_fbank(audio_tensor)
                    if voice_fbank_mode == "torchaudio":
                        feats = feats.transpose(1, 2)
                    emb = voice_model(feats)
                    emb = F.normalize(emb, dim=1).squeeze(0)
                
                best_person, best_score = "Unknown", -1.0
                for person, db_emb in embeddings_cache["voices"].items():
                    db_emb_tensor = torch.from_numpy(db_emb).float()
                    score = torch.dot(emb, db_emb_tensor).item()
                    if score > best_score:
                        best_score = score
                        best_person = person
                
                voice_result["active"] = True
                voice_result["person"] = best_person
                voice_result["raw_score"] = best_score
            except Exception as e:
                print(f"Voice recognition error: {e}")

        # Perform fusion
        fusion_result = fuse(
            face_result["person"], face_result["raw_score"], face_result["active"],
            voice_result["person"], voice_result["raw_score"], voice_result["active"]
        )

        return jsonify({
            "recognized": fusion_result["identity"] != "Unknown",
            "identity": fusion_result["identity"],
            "fused_score": fusion_result["fused_score"],
            "mode": fusion_result["mode"],
            "conflict": fusion_result["conflict"],
            "face": {
                "person": face_result["person"],
                "score": round(face_result["raw_score"], 4),
                "active": face_result["active"]
            },
            "voice": {
                "person": voice_result["person"],
                "score": round(voice_result["raw_score"], 4),
                "active": voice_result["active"]
            }
        })

    except Exception as e:
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ==========================================
# 🔧 UTILITY ENDPOINTS
# ==========================================
@app.route('/api/health', methods=['GET'])
def health():
    """Health check"""
    return jsonify({
        "status": "ok",
        "face_model_loaded": face_app is not None,
        "voice_model_loaded": voice_model is not None,
        "faces_registered": len(embeddings_cache["faces"]),
        "voices_registered": len(embeddings_cache["voices"])
    })


@app.route('/api/registered_people', methods=['GET'])
def registered_people():
    """Get list of registered people"""
    return jsonify({
        "faces": list(embeddings_cache["faces"].keys()),
        "voices": list(embeddings_cache["voices"].keys())
    })


@app.route('/api/clear_embeddings', methods=['POST'])
def clear_embeddings():
    """Clear all embeddings (development only)"""
    embeddings_cache["faces"].clear()
    embeddings_cache["voices"].clear()
    return jsonify({"message": "Embeddings cleared"})


def extract_voice_embedding_from_path(wav_path: str):
    """
    Helper function to extract voice embedding from a WAV file path.
    Used by refresh_embeddings endpoint.
    
    Args:
        wav_path: Full path to WAV file
    
    Returns:
        Embedding as numpy array or None if extraction fails
    """
    try:
        if not voice_model or not voice_fbank:
            return None
        
        import scipy.io.wavfile as wavfile
        
        rate, pcm = wavfile.read(wav_path)
        
        # Convert to mono if stereo
        if len(pcm.shape) > 1:
            pcm = pcm[:, 0]
        
        # Normalize
        pcm = pcm.astype(np.float32) / 32768.0
        
        # Resample if needed
        if rate != RATE:
            from scipy.signal import resample
            num_samples = int(len(pcm) * RATE / rate)
            pcm = resample(pcm, num_samples)
        
        audio_tensor = torch.from_numpy(pcm).unsqueeze(0).float()
        
        with torch.no_grad():
            feats = voice_fbank(audio_tensor)
            
            if voice_fbank_mode == "torchaudio":
                feats = feats.transpose(1, 2)
            
            emb = voice_model(feats)
            embedding = F.normalize(emb, dim=1).squeeze(0).cpu().numpy()
        
        return embedding
        
    except Exception as e:
        print(f"[Audio] Error extracting embedding from {wav_path}: {e}")
        return None


@app.route('/api/refresh_embeddings', methods=['POST'])
def refresh_embeddings():
    """
    Refresh face/voice embeddings from uploads folder.
    Scans uploads/patients/<patient>/<person>/{faces,voices} and updates the in-memory cache.
    """
    try:
        print("\n[API] 🔄 Refresh embeddings requested")
        payload = request.get_json(silent=True) or {}
        target_patient_name = payload.get("patient_name")

        def safe_folder_name(value):
            return re.sub(r'[\\/:\*?"<>|]+', '', (value or 'unknown').strip()).replace(' ', '_') or 'unknown'

        if target_patient_name:
            embeddings_cache["faces"].clear()
            embeddings_cache["voices"].clear()

        uploads_root = os.path.join(PARENT_DIR, "..", "uploads")
        patients_root = os.path.join(uploads_root, "patients")

        def scan_person_folder(person_folder, person_name):
            face_embeddings = []
            voice_embeddings = []

            face_dir = os.path.join(person_folder, "faces")
            if os.path.exists(face_dir):
                for img_name in os.listdir(face_dir):
                    if not img_name.lower().endswith((".jpg", ".jpeg", ".png")):
                        continue
                    try:
                        img_path = os.path.join(face_dir, img_name)
                        img = Image.open(img_path).convert("RGB")
                        faces = face_app.get(np.array(img))
                        if faces:
                            face_embeddings.append(faces[0].embedding)
                    except Exception as e:
                        print(f"[API]   Error processing {img_name}: {e}")

            voice_dir = os.path.join(person_folder, "voices")
            if os.path.exists(voice_dir):
                for wav_name in os.listdir(voice_dir):
                    if not wav_name.lower().endswith(".wav"):
                        continue
                    try:
                        wav_path = os.path.join(voice_dir, wav_name)
                        emb = extract_voice_embedding_from_path(wav_path)
                        if emb is not None:
                            voice_embeddings.append(emb)
                    except Exception as e:
                        print(f"[API]   Error processing {wav_name}: {e}")

            if face_embeddings:
                embeddings_cache["faces"][person_name] = np.mean(face_embeddings, axis=0).tolist()
            if voice_embeddings:
                embeddings_cache["voices"][person_name] = np.mean(voice_embeddings, axis=0).tolist()

            return len(face_embeddings), len(voice_embeddings)

        face_count = 0
        voice_count = 0

        if os.path.exists(patients_root):
            patient_dirs = [safe_folder_name(target_patient_name)] if target_patient_name else os.listdir(patients_root)
            for patient_name in patient_dirs:
                patient_folder = os.path.join(patients_root, patient_name)
                if not os.path.isdir(patient_folder):
                    continue

                print(f"[API] Scanning patient folder: {patient_folder}")
                for person_name in os.listdir(patient_folder):
                    person_folder = os.path.join(patient_folder, person_name)
                    if not os.path.isdir(person_folder):
                        continue

                    person_faces, person_voices = scan_person_folder(person_folder, person_name)
                    if person_faces > 0:
                        face_count += 1
                        print(f"[API]   ✓ {patient_name}/{person_name}: {person_faces} images → embedding stored")
                    if person_voices > 0:
                        voice_count += 1
                        print(f"[API]   ✓ {patient_name}/{person_name}: {person_voices} files → embedding stored")

        result = {
            "status": "success",
            "patient_name": target_patient_name,
            "faces_updated": face_count,
            "voices_updated": voice_count,
            "total_faces_registered": len(embeddings_cache["faces"]),
            "total_voices_registered": len(embeddings_cache["voices"]),
            "registered_faces": list(embeddings_cache["faces"].keys()),
            "registered_voices": list(embeddings_cache["voices"].keys())
        }

        print(f"[API] ✅ Refresh complete: {face_count} face people, {voice_count} voice people")
        return jsonify(result), 200
        
    except Exception as e:
        print(f"[API] ❌ Error during refresh: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ==========================================
# 🚀 STARTUP
# ==========================================
if __name__ == '__main__':
    print("[App] Initializing models...")
    initialize_models()
    print("[App] Starting Flask server...")
    app.run(host='0.0.0.0', port=5000, debug=False)
