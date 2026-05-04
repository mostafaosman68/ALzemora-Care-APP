# Multimodal Recognition Integration - Complete Setup Guide

## What Was Integrated

Your ML code has been integrated into the Alzheimer Care app as a microservice architecture:

```
┌─────────────────────────────────────────────────────────┐
│                 Mobile Frontend (React Native)          │
└────────────────────┬────────────────────────────────────┘
                     │
        HTTP API calls (REST)
                     │
        ┌────────────┴────────────┐
        │                         │
┌───────▼──────────┐     ┌───────▼──────────┐
│  Node.js Backend │     │   Flask ML      │
│  (port 3000)     │────▶│   Service       │
│                  │     │  (port 5000)    │
│  • Auth          │     │                 │
│  • Patients      │     │  • Face Detect  │
│  • Family        │     │  • Voice Detect │
│  • Orchestration │     │  • Embedding    │
│  • MongoDB       │     │  • Fusion Logic │
└──────────────────┘     └─────────────────┘
         │
    ┌────▼────────┐
    │  MongoDB    │
    │  Embeddings │
    └─────────────┘
```

## Directory Structure

```
backend/
├── src/
│   ├── routes/
│   │   ├── family.js                    ← UPDATED: Calls ML service
│   │   ├── auth.js
│   │   ├── patients.js
│   │   └── medications.js
│   ├── index.js
│   ├── database/
│   └── middleware/
├── ml_service/                          ← NEW: ML microservice
│   ├── app.py                           ← Flask app with endpoints
│   └── __init__.py
├── setup_ml.py                          ← Setup script (generates ml_service/)
├── startup.py                           ← Startup assistant (Python)
├── start.bat                            ← Startup assistant (Batch)
├── setup_ml.py                          ← NEW
├── package.json                         ← UPDATED: Added node-fetch, form-data
├── requirements-ml.txt                  ← NEW: Python ML dependencies
├── .env.example                         ← UPDATED: Added ML_SERVICE_URL
├── ML_SERVICE_SETUP.md                  ← NEW: Detailed ML setup guide
└── MULTIMODAL_INTEGRATION.md            ← THIS FILE
```

## Quick Start (5 minutes)

### 1. Install Dependencies

**Option A: Using Python startup script**
```bash
cd backend
python startup.py
```

**Option B: Manual**
```bash
# Node dependencies
cd backend
npm install

# Python dependencies (if not already installed)
pip install -r requirements-ml.txt

# Setup ML service
python setup_ml.py
```

### 2. Configure Environment
Ensure `.env` in backend has:
```env
MONGODB_URL=your_mongodb_url
MONGODB_DB_NAME=Alzemora
PORT=3000
JWT_SECRET=your_secret
ML_SERVICE_URL=http://localhost:5000/api
```

### 3. Start Services

**Terminal 1 - ML Service (START FIRST)**
```bash
cd backend
python ml_service/app.py
```
Wait for: `[App] Starting Flask server...`

**Terminal 2 - Node Backend**
```bash
cd backend
npm run dev
```
Wait for: `Alzheimer Care API running on http://localhost:3000`

Done! Your app now has real multimodal recognition.

## What Happens When...

### A Guardian Uploads a Family Member's Photo

```
Mobile App (take photo)
    ↓
POST /api/patients/{id}/family/{memberId}/face
    ↓
Node Backend
    ├─ Save file to /uploads/faces/{name}/
    ├─ Extract path
    └─ Call ML Service in background:
        POST /api/extract_face_embedding
        ├─ InsightFace detects face
        ├─ Extracts 192D embedding vector
        └─ Returns embedding
    ├─ Store embedding in MongoDB
    │  (people.face_embedding)
    └─ Return success to mobile

Result: Member now registered for face recognition
```

### A Guardian Uploads a Family Member's Voice

Same as above but:
- ML Service endpoint: `/api/extract_voice_embedding`
- ECAPA-TDNN model extracts voice embedding
- Stored in MongoDB `people.voice_embedding`

### A Patient's Face is Captured for Recognition

```
Mobile App (capture photo)
    ↓
POST /api/patients/{id}/family/recognize [multipart: photo]
    ↓
Node Backend
    ├─ Fetch all family members
    ├─ Load their embeddings from MongoDB
    ├─ Call ML Service:
    │  POST /api/recognize_face
    │  ├─ Extract embedding from captured photo
    │  ├─ Compare with all registered embeddings
    │  ├─ Return best match + confidence
    │  └─ If confidence < threshold: return "Unknown"
    └─ Return match to mobile
        {
          "recognized": true,
          "member": { id, name, relationship, ... },
          "confidence": 0.87,
          "mode": "face_only"
        }

Result: Guardian sees who was detected and confidence level
```

## Recognition Workflow

### Registration (One-Time per Member)
- User uploads family member photo → Saved to `/uploads/faces/`
- Backend extracts embedding → Stored in MongoDB
- User uploads voice recording → Saved to `/uploads/voices/`
- Backend extracts embedding → Stored in MongoDB

### Recognition (Real-Time, No Save)
- **Camera Stream**: User points phone camera → Direct base64 to backend
- **Gallery Photo**: User selects photo → Base64 to backend
- **No files saved** to disk or database
- Embeddings compared in memory
- Person identified in milliseconds

See [`CAMERA_AND_RECOGNITION.md`](CAMERA_AND_RECOGNITION.md) for camera implementation details.

## Data Storage

### MongoDB Schema (Updated)

```javascript
// people collection
{
  _id: ObjectId,
  user_id: "guardian_id",
  name: "John (Son)",
  relation: "Son",
  photo_url: "/uploads/faces/John/face-123456.jpg",
  voice: "/uploads/voices/John/voice-123456.wav",
  
  // NEW: Embeddings stored for ML service
  face_embedding: [0.234, 0.456, ..., 0.789],  // 512D vector
  voice_embedding: [0.123, 0.456, ..., 0.987], // 192D vector
  
  created_at: Date,
  permissions: null
}
```

### Uploads Directory

```
uploads/
├── faces/
│   ├── John/
│   │   ├── face-1234567890-photo.jpg
│   │   ├── face-1234567891-photo.jpg
│   │   └── face-1234567892-photo.jpg
│   └── Mary/
│       └── face-1234567893-photo.jpg
└── voices/
    ├── John/
    │   ├── voice-1234567894-recording.wav
    │   └── voice-1234567895-recording.wav
    └── Mary/
        └── voice-1234567896-recording.wav
```

## Customization

### Adjust Recognition Thresholds

Edit `backend/ml_service/app.py`:

```python
FACE_THRESHOLD = 0.40         # Increase for stricter face matching
VOICE_THRESHOLD = 0.45        # Increase for stricter voice matching
FUSION_THRESHOLD = 0.55       # Min score when combining face + voice

FUSION_MIN_FACE_SCORE = 0.35  # Min face score to use in fusion
FUSION_MIN_VOICE_SCORE = 0.40 # Min voice score to use in fusion

W_FACE = 0.70                 # Face weight (vs voice weight 0.30)
W_VOICE = 0.30
```

Then restart ML service. Frontend will see new accuracy immediately.

### Multimodal Fusion Logic

When both face and voice are available:
1. **Agreement**: Both identify same person → High confidence
2. **Disagreement**: Face says "John", voice says "Mary" → Penalized (0.8x multiplier)
3. **Speaker Not Visible**: Voice identified someone, but no face → Still recognized
4. **Single Modality**: Face only or voice only → Use single score

See `fuse()` function in `backend/ml_service/app.py` for details.

## API Endpoints (Backend)

### Family Recognition

```
POST /api/patients/:patientId/family/recognize
├─ Content-Type: multipart/form-data
├─ Body:
│  └─ photo: <image file>
├─ Returns:
│  ├─ recognized: bool
│  ├─ member: { id, name, relationship, ... }
│  ├─ confidence: 0-1
│  └─ mode: "face_only" | "voice_only" | "face+voice" | "unknown"
└─ Status: 200 (success), 400 (no photo), 500 (error)
```

### Family Member Management

```
PUT /api/patients/:patientId/family/:memberId/face
├─ Upload photo → Extract & store face embedding
└─ Called in background (non-blocking)

PUT /api/patients/:patientId/family/:memberId/voice
├─ Upload voice → Extract & store voice embedding
└─ Called in background (non-blocking)
```

### ML Service Health Check (Debugging)

```
GET http://localhost:5000/api/health
Returns:
{
  "status": "ok",
  "face_model_loaded": true,
  "voice_model_loaded": true,
  "faces_registered": 3,
  "voices_registered": 2
}
```

## Error Handling

### ML Service Unavailable
- Node backend returns: `"recognized": false, "message": "ML service unavailable", "fallback": true`
- Mobile app can display: "Can't recognize right now, try again"

### No Face Detected
- Node backend returns: `"recognized": false, "message": "No face detected"`

### Low Confidence
- If confidence < threshold, return: `"recognized": false, "message": "Unknown face"`

## Performance & Optimization

### Speed
- Face recognition: ~100-200ms per image
- Voice recognition: ~200-400ms per audio
- Embedding storage: Instant (in-memory cache)

### Memory Usage
- Face model: ~100MB
- Voice model: ~50MB
- Per embedding: ~2KB (192 dimensions × 4 bytes)
- 1000 family members: ~2MB embeddings

### Scaling Tips
1. GPU acceleration: Change `ctx_id=0` to `ctx_id=0` with CUDA GPU
2. Model optimization: quantize models for faster inference
3. Caching: Embeddings cached in memory (reload on service restart)
4. Batch processing: Process multiple uploads in parallel

## Troubleshooting

### "ML service not available" Error
1. Check Flask is running: `curl http://localhost:5000/api/health`
2. Check `ML_SERVICE_URL` in `.env`
3. Check firewalls/ports
4. Restart Flask service

### Low Face Recognition Accuracy
1. Upload higher quality photos (clear, frontal face, good lighting)
2. Lower `FACE_THRESHOLD` in `app.py` (e.g., 0.35 instead of 0.40)
3. Register multiple face photos per person
4. Check embeddings are stored: `GET http://localhost:5000/api/registered_people`

### Low Voice Recognition Accuracy
1. Use clear, quiet audio recordings
2. Record at least 3-5 seconds
3. Lower `VOICE_THRESHOLD` (e.g., 0.40 instead of 0.45)
4. Register multiple voice samples per person

### Models Not Loading
Check that:
- `buffalo_s` model files are auto-downloaded (first run only)
- ECAPA model files exist at `data/pretrained_ecapa_local/`
- Required Python packages installed: `pip install insightface torch torchaudio speechbrain`

## Database Schema Changes

Added to `people` collection:
```
face_embedding: [192-dimensional array]  // InsightFace embedding
voice_embedding: [192-dimensional array] // ECAPA-TDNN embedding
```

These are automatically populated when photos/voice are uploaded.

## Migration Notes (If Updating Existing App)

1. Run `npm install` in backend (adds `node-fetch`, `form-data`)
2. Run `python setup_ml.py` to create ML service
3. Update `.env` with `ML_SERVICE_URL`
4. Existing face/voice uploads will be re-processed when ML service starts
5. Embeddings will populate in MongoDB

## Frontend Integration (Reference)

The mobile app already has endpoints to upload photos/voice. No frontend changes needed! Just ensure:

1. Mobile sends to: `POST /api/patients/{id}/family/{memberId}/face`
2. Backend automatically extracts embedding and stores
3. Recognition endpoint remains: `POST /api/patients/{id}/family/recognize`

## Next Steps

1. ✅ Install dependencies
2. ✅ Start ML service
3. ✅ Start Node backend
4. ⏭️ Test face upload in app
5. ⏭️ Verify embeddings in MongoDB
6. ⏭️ Test recognition
7. ⏭️ Tune thresholds for your use case
8. ⏭️ Deploy to production

## Support

For issues:
1. Check `ML_SERVICE_SETUP.md` for detailed troubleshooting
2. Check ML service logs: `python ml_service/app.py`
3. Check Node backend logs: `npm run dev`
4. Test endpoints manually with curl

## Files Created/Modified

**Created:**
- `backend/ml_service/app.py` - Flask ML service
- `backend/ml_service/__init__.py` - Package init
- `backend/setup_ml.py` - Setup script
- `backend/startup.py` - Python startup assistant
- `backend/start.bat` - Batch startup assistant
- `backend/requirements-ml.txt` - Python dependencies
- `backend/ML_SERVICE_SETUP.md` - ML setup guide
- `backend/MULTIMODAL_INTEGRATION.md` - This file

**Modified:**
- `backend/src/routes/family.js` - Added ML service integration
- `backend/package.json` - Added node-fetch, form-data
- `backend/.env.example` - Added ML_SERVICE_URL

**No changes needed:**
- Frontend code (uses same API endpoints)
- Database structure (MongoDB handles schema)
- Other backend routes
