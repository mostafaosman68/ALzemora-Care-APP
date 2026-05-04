# ML Service Integration Guide

## Overview
The multimodal recognition system consists of:
- **Flask ML Service** (port 5000): Handles face/voice recognition, embedding extraction
- **Node.js Backend** (port 3000): Orchestrates API calls and stores embeddings in MongoDB

## Setup

### 1. Prerequisites
- Python 3.8+
- Node.js 16+
- pip package manager

### 2. Install Node Dependencies (Backend)
```bash
cd backend
npm install
```

### 3. Setup ML Service Structure
```bash
# From backend directory
python setup_ml.py
```

This creates:
- `ml_service/` directory
- `ml_service/app.py` (Flask app)
- `requirements-ml.txt` (Python dependencies)

### 4. Install Python Dependencies
```bash
pip install -r requirements-ml.txt
```

### 5. Download Pretrained Models
You need to provide the pretrained ECAPA model. Place it at:
```
data/pretrained_ecapa_local/
├── hyperparams.yaml
├── embedding_model.ckpt
└── label_encoder.txt
```

The face model (buffalo_s) will be auto-downloaded by InsightFace on first run.

### 6. Configure Environment

**Backend (.env)**
```env
MONGODB_URL=mongodb+srv://...
MONGODB_DB_NAME=Alzemora
PORT=3000
JWT_SECRET=your_secret
ML_SERVICE_URL=http://localhost:5000/api
```

### 7. Start Services

**Terminal 1 - ML Service**
```bash
cd backend/ml_service
python app.py
```
Expected output: `[App] Starting Flask server...`

**Terminal 2 - Node Backend**
```bash
cd backend
npm run dev
```
Expected output: `Alzheimer Care API running on http://localhost:3000`

## Architecture

### Data Flow
1. **Upload Family Member Face/Voice**
   - Frontend sends file to Node backend
   - Backend stores file in `/uploads`
   - Backend sends to ML service for embedding extraction
   - ML service returns embedding vector
   - Backend stores embedding in MongoDB `people.face_embedding` or `people.voice_embedding`

2. **Recognition**
   - Frontend sends query image to `/api/patients/:id/family/recognize`
   - Node backend retrieves registered member embeddings
   - Backend loads embeddings into ML service memory
   - ML service performs face recognition
   - Returns match with confidence score

### Endpoints

#### ML Service Endpoints (Flask)
```
POST /api/extract_face_embedding      - Extract embedding from image
POST /api/register_face                - Register face embedding in memory
POST /api/recognize_face               - Recognize face from image
POST /api/extract_voice_embedding      - Extract embedding from audio
POST /api/register_voice               - Register voice embedding in memory
POST /api/recognize_voice              - Recognize voice from audio
POST /api/recognize_multimodal         - Recognize using face + voice (fusion)
GET  /api/health                       - Check service status
GET  /api/registered_people            - List cached embeddings
POST /api/clear_embeddings             - Clear memory cache (dev only)
```

#### Node Backend Endpoints
```
PUT  /api/patients/:id/family/:memberId/face      - Upload face + extract embedding (SAVES)
PUT  /api/patients/:id/family/:memberId/voice     - Upload voice + extract embedding (SAVES)
POST /api/patients/:id/family/recognize           - Recognize face (DOES NOT SAVE)
     Supports:
     • multipart: form-data with 'image' file (gallery)
     • JSON: {"imageBase64": "base64_string"} (camera)
     • JSON: {"imageBuffer": [...]} (camera binary)
```

## Configuration

### Recognition Thresholds (in `ml_service/app.py`)
```python
FACE_THRESHOLD = 0.40         # Min score for face match
VOICE_THRESHOLD = 0.45        # Min score for voice match
FUSION_THRESHOLD = 0.55       # Min fused score
FUSION_MIN_FACE_SCORE = 0.35
FUSION_MIN_VOICE_SCORE = 0.40

W_FACE = 0.70                 # Face weight in fusion
W_VOICE = 0.30                # Voice weight in fusion
```

Adjust these values in `ml_service/app.py` and restart the service.

### Response Format

**Recognition Response**
```json
{
  "recognized": true,
  "member": {
    "id": "...",
    "name": "John",
    "relationship": "Son",
    "face_photo_path": "/uploads/faces/...",
    "voice_path": "/uploads/voices/..."
  },
  "confidence": 0.8234,
  "mode": "face_only"
}
```

**Multimodal Fusion Response**
```json
{
  "recognized": true,
  "identity": "John",
  "fused_score": 0.8765,
  "mode": "face+voice",
  "conflict": false,
  "face": {
    "person": "John",
    "score": 0.92,
    "active": true
  },
  "voice": {
    "person": "John",
    "score": 0.83,
    "active": true
  }
}
```

## Troubleshooting

### ML Service won't start
- Check Python version: `python --version` (need 3.8+)
- Check PyTorch installation: `python -c "import torch; print(torch.__version__)"`
- Check model path: Ensure `data/pretrained_ecapa_local/` exists with required files

### Face/voice not extracted
- Check image/audio file format (JPEG/PNG for images, WAV for audio recommended)
- Verify image has clear faces (single face is best)
- Check audio is at least 1 second long

### ML Service connection error
- Verify Flask is running on port 5000: `netstat -ano | findstr :5000` (Windows)
- Check `ML_SERVICE_URL` in backend `.env` is correct
- Try `curl http://localhost:5000/api/health`

### Low recognition accuracy
- Try uploading higher quality images (good lighting, clear face)
- Use professional audio recordings (low noise)
- Adjust thresholds in `ml_service/app.py`
- Ensure embeddings are properly stored in MongoDB

## Performance Tips

1. **GPU Acceleration**: If you have NVIDIA GPU:
   ```bash
   pip install torch torchcuda
   # Then modify ml_service/app.py ctx_id=0 to use GPU
   ```

2. **Memory Management**: Embeddings are cached in ML service memory
   - Service can handle hundreds of embeddings
   - Clear cache via `POST /api/clear_embeddings` if needed

3. **Batch Processing**: Don't upload too many images at once
   - Process face/voice uploads one at a time
   - Let embedding extraction complete before next upload

## Development Notes

- Embeddings are 192-dimensional vectors (from ECAPA-TDNN)
- Face embeddings are cached in ML service across requests
- Voice embeddings are extracted per request (can be optimized)
- MongoDB stores all embeddings for persistence

## Next Steps

1. Test face upload workflow in the app
2. Verify embeddings are being stored in MongoDB
3. Test recognition with registered faces
4. Fine-tune thresholds based on accuracy
5. Consider GPU acceleration for production
