# 🎯 Quick Visual Guide - Multimodal Recognition

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│            Your Mobile App (React Native)                  │
│                                                            │
│  • Take photo → recognize family member                   │
│  • Upload voice → identify speaker                        │
│  • See confidence scores                                  │
└────────────────────┬────────────────────────────────────┘
                     │
        HTTP REST API (CORS enabled)
                     │
        ┌────────────┴───────────────────┐
        │                                 │
┌───────▼──────────────┐       ┌────────▼───────────────┐
│  Node.js Backend      │       │   Flask ML Service    │
│  (port 3000)          │       │   (port 5000)         │
│                       │       │                       │
│  ✓ Auth               │       │  ✓ Face Detection     │
│  ✓ Patients           │◄────►│  ✓ Voice Recognition  │
│  ✓ Family management  │       │  ✓ Embeddings        │
│  ✓ Data validation    │       │  ✓ Fusion Logic      │
│  ✓ Orchestration      │       │                       │
└───────┬──────────────┘       └───────────────────────┘
        │
        ▼
    ┌─────────────────────────┐
    │   MongoDB Atlas         │
    │                         │
    │ Collections:            │
    │ • users (guardians)     │
    │ • patients              │
    │ • people (family)       │
    │   - NEW: embeddings     │
    │                         │
    └─────────────────────────┘
```

## Data Flow - Face Recognition

```
Step 1: UPLOAD PHOTO
┌─────────────────┐
│   Mobile App    │
│  User selects   │
│  family photo   │
└────────┬────────┘
         │ POST /family/{id}/face (multipart)
         ▼
┌──────────────────────────────────┐
│   Node.js Backend                │
│ 1. Save to /uploads/faces/John/  │
│ 2. Call ML service in background │
└────────┬─────────────────────────┘
         │ POST /extract_face_embedding
         ▼
┌──────────────────────────────────┐
│   Flask ML Service               │
│ 1. Load image                    │
│ 2. InsightFace detects face      │
│ 3. Extract 512D embedding        │
│ 4. Return embedding vector       │
└────────┬─────────────────────────┘
         │ JSON: {embedding: [...]}
         ▼
┌──────────────────────────────────┐
│   Node.js Backend                │
│ 1. Receive embedding             │
│ 2. Store in MongoDB              │
│    people.face_embedding = [...]  │
│ 3. Return success to app         │
└──────────────────────────────────┘

Result: John is now registered for face recognition ✓
```

## Data Flow - Face Recognition (Using Registered Data)

```
Step 2: RECOGNIZE FACE
┌──────────────────┐
│   Mobile App     │
│  Take/upload     │
│  mystery photo   │
└────────┬─────────┘
         │ POST /family/recognize (multipart)
         ▼
┌────────────────────────────────────┐
│   Node.js Backend                  │
│ 1. Get all family members          │
│ 2. Fetch their embeddings from DB  │
│    • face_embedding: [...]         │
│    • voice_embedding: [...]        │
│ 3. Load into ML service memory     │
│ 4. Send mystery photo              │
└────────┬───────────────────────────┘
         │ POST /recognize_face
         ▼
┌────────────────────────────────────┐
│   Flask ML Service                 │
│ 1. Extract embedding from photo    │
│ 2. Compare with all registered:    │
│    John:  0.87 ← BEST MATCH        │
│    Mary:  0.42                     │
│    David: 0.31                     │
│ 3. Check threshold (0.40)          │
│ 4. Return: John, confidence 0.87   │
└────────┬───────────────────────────┘
         │ JSON: {person: "John", score: 0.87}
         ▼
┌────────────────────────────────────┐
│   Node.js Backend                  │
│ 1. Receive match                   │
│ 2. Find John in MongoDB            │
│ 3. Return with full data:          │
│    {                               │
│      name: "John",                │
│      relationship: "Son",         │
│      photo_url: "/uploads/...",  │
│      confidence: 0.87             │
│    }                              │
└────────┬───────────────────────────┘
         │ JSON response
         ▼
┌──────────────────────────────────────┐
│   Mobile App - Shows to Guardian      │
│                                      │
│  ✓ RECOGNIZED: John (Son)           │
│  Confidence: 87%                    │
│ [photo of John]                     │
│                                     │
│  This person appears to be John    │
└──────────────────────────────────────┘

Result: Mystery person identified as John ✓
```

## Configuration: Tuning Recognition Accuracy

```
TOO MANY FALSE POSITIVES?
(Unknown people being recognized)
       │
       ▼
┌─────────────────────────┐
│  INCREASE THRESHOLDS    │
│                         │
│  FACE_THRESHOLD = 0.50  │ (was 0.40)
│  VOICE_THRESHOLD = 0.55 │ (was 0.45)
│  FUSION_THRESHOLD = 0.65│ (was 0.55)
│                         │
│  Effect: Stricter       │
│  Requires: Higher match │
│  Result: Fewer false +  │
└─────────────────────────┘


NOT RECOGNIZING PEOPLE?
(Known people being rejected)
       │
       ▼
┌─────────────────────────┐
│  DECREASE THRESHOLDS    │
│                         │
│  FACE_THRESHOLD = 0.30  │ (was 0.40)
│  VOICE_THRESHOLD = 0.35 │ (was 0.45)
│  FUSION_THRESHOLD = 0.45│ (was 0.55)
│                         │
│  Effect: Lenient        │
│  Requires: Lower match  │
│  Result: More captures  │
└─────────────────────────┘
```

## Deployment Architecture

```
PRODUCTION SETUP
┌────────────────────────────────────────────────┐
│          Public Endpoint                       │
│  https://app.alzheimor.com                   │
└─────────────────────┬──────────────────────────┘
                      │
    ┌─────────────────┴──────────────────┐
    │                                    │
    ▼                                    ▼
┌──────────────────┐          ┌──────────────────┐
│ Node.js Backend  │          │  Flask ML Svc    │
│ AWS EC2 / Cloud  │         │  AWS EC2 / Cloud │
│ Port 3000        │◄───────►│  Port 5000       │
└──────────────────┘          └──────────────────┘
    │
    ▼
┌──────────────────┐
│  MongoDB Atlas   │
│  Cloud Database  │
└──────────────────┘

Environment:
.env (production):
├── MONGODB_URL=prod_mongodb_url
├── ML_SERVICE_URL=http://ml-service-internal:5000/api
└── JWT_SECRET=strong_random_secret_prod
```

## File Organization

```
Step 1: ONE TIME SETUP
┌─────────────────────┐
│  python setup_ml.py │
└──────────┬──────────┘
           │
           ▼
    Creates: ml_service/
              ├── __init__.py
              └── app.py (800+ lines)

Step 2: INSTALL DEPS
┌──────────────────────────────────────┐
│  npm install                         │ (Node deps)
│  pip install -r requirements-ml.txt  │ (Python deps)
└──────────────────────────────────────┘

Step 3: START SERVICES
┌──────────────────────┐
│ Terminal 1:          │
│ python ml_service/   │
│ app.py               │
│                      │
│ Terminal 2:          │
│ npm run dev          │
└──────────────────────┘

Step 4: USE APP
┌──────────────────────┐
│ Upload family photos │
│ ↓                    │
│ Take recognition     │
│ photos               │
│ ↓                    │
│ Get matches with     │
│ confidence scores    │
└──────────────────────┘
```

## Response Examples

### Face Recognition Response

```json
{
  "recognized": true,
  "member": {
    "id": "507f1f77bcf86cd799439011",
    "name": "John",
    "relationship": "Son",
    "face_photo_path": "/uploads/faces/John/face-123456789.jpg",
    "voice_path": "/uploads/voices/John/voice-987654321.wav"
  },
  "confidence": 0.8734,
  "mode": "face_only"
}
```

### Unknown Face Response

```json
{
  "recognized": false,
  "message": "Unknown face",
  "confidence": 0.3421,
  "mode": "unknown"
}
```

### ML Service Down (Fallback)

```json
{
  "recognized": false,
  "message": "ML service unavailable",
  "fallback": true
}
```

## Performance Timeline

```
Upload Photo to Recognition:

1. User takes photo                    0ms
   ↓
2. Backend receives                    +50ms
   ↓
3. Face extraction in ML               +150ms
   ├─ Load image
   ├─ Detect face
   └─ Extract 512D embedding
   ↓
4. Embedding comparison                +100ms
   ├─ Load all registered embeddings
   └─ Compare (cosine similarity)
   ↓
5. Backend processes result            +50ms
   ↓
6. Mobile displays                     +50ms

TOTAL: ~400ms (feels instant to user)
```

## Status Indicators

```
ML Service Running:
┌─────────────────────────────────────┐
│  curl http://localhost:5000/api/    │
│         health                      │
│                                     │
│  {                                  │
│    "status": "ok" ✓                │
│    "face_model_loaded": true ✓     │
│    "voice_model_loaded": true ✓    │
│    "faces_registered": 5           │
│    "voices_registered": 3          │
│  }                                  │
└─────────────────────────────────────┘

Backend Running:
┌─────────────────────────────────────┐
│  curl http://localhost:3000/api/    │
│         health                      │
│                                     │
│  {                                  │
│    "status": "ok" ✓                │
│    "timestamp": "2026-05-03T00..." │
│  }                                  │
└─────────────────────────────────────┘
```

## Troubleshooting Flow

```
App doesn't recognize faces?
        │
        ├─ Check: Services running?
        │  ├─ YES ─────┐
        │  └─ NO ──► START SERVICES
        │
        ├─ Check: Embeddings in DB?
        │  ├─ YES ─────┐
        │  └─ NO ──► UPLOAD NEW PHOTOS
        │
        ├─ Check: Good quality photo?
        │  ├─ YES ─────┐
        │  └─ NO ──► TAKE BETTER PHOTO
        │
        ├─ Check: Threshold too high?
        │  ├─ YES ─────► LOWER THRESHOLD
        │  └─ NO ──┐
        │
        └─► Check ML service logs
             (Terminal 1 output)
```

---

**This is a complete visual guide to your multimodal recognition system.**
**Refer to documentation files for detailed setup & configuration.**
