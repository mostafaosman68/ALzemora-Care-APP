# Alzheimer Care Guardian App

A full-stack mobile application for guardians managing Alzheimer's patients.

## Features
- Guardian authentication with patient-name login
- Multiple patients per guardian (switch without logging out)
- Patient profile management
- Heart rate monitoring backed by stored sensor readings
- Face recognition system (photo gallery + recognition endpoint)
- Family voice recordings (audio recording + playback)
- Medication management with object detection (photos + schedules + daily tracking)
- Dashboard with today's medications and real-time BPM

## Stack
- **Frontend**: React Native + Expo SDK 51, TypeScript, Zustand, Expo Router
- **Backend**: Node.js + Express, MongoDB Atlas, JWT auth, Multer

---

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env        # edit MONGODB_URL, MONGODB_DB_NAME, JWT_SECRET
npm run dev                 # starts on port 3000
```

### 2. Frontend

```bash
cd frontend
npm install
```

For Expo Go, use a public backend URL (do not hardcode local IP in code).

1. Create `frontend/.env` from `frontend/.env.example`
2. Set your backend URL:

```bash
EXPO_PUBLIC_API_URL=https://your-backend-domain.onrender.com
```

The app already reads `EXPO_PUBLIC_API_URL` in `frontend/services/api.ts`.

```bash
npm start          # scan QR code with Expo Go app
```

### 3. Deploy Backend (Render example)

```bash
cd backend
npm install
```

Create a Web Service on Render using the `backend` folder:

- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`

Add environment variables in Render:

- `MONGODB_URL`
- `MONGODB_DB_NAME`
- `JWT_SECRET`
- `PORT` (Render provides this automatically)

After deploy, copy your Render URL and set it as `EXPO_PUBLIC_API_URL` in `frontend/.env`.

Quick temporary alternative (no full deploy): run a tunnel to local backend (for testing only), for example with `ngrok http 3000`, then use the HTTPS URL in `EXPO_PUBLIC_API_URL`.

---

## ML Integration

This project now includes **real multimodal face + voice recognition** instead of mock recognition:

- **Face Recognition**: InsightFace (buffalo_s) - 512D embeddings
- **Voice Recognition**: ECAPA-TDNN - 192D embeddings  
- **Fusion Logic**: Combined face + voice confidence scoring
- **Architecture**: Microservice (Flask ML service + Node backend)

[📖 Complete ML Setup Guide](backend/MULTIMODAL_INTEGRATION.md)

### Quick Start
```bash
cd backend

# Install dependencies
python startup.py  # or manually: npm install && pip install -r requirements-ml.txt

# Terminal 1: Start ML Service
python ml_service/app.py

# Terminal 2: Start Backend
npm run dev
```

The recognition system will:
1. Extract embeddings when family members upload photos/voice
2. Store embeddings in MongoDB
3. Recognize faces/voices in real-time with confidence scores
4. Fuse face + voice results for higher accuracy

See [ML_SERVICE_SETUP.md](backend/ML_SERVICE_SETUP.md) for detailed configuration and troubleshooting.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register guardian |
| POST | /api/auth/login | Login (email + password + patientName) |
| GET | /api/auth/me | Get guardian profile |
| GET | /api/auth/my-patients | List all guardian's patients |
| GET/POST | /api/patients | List / create patients |
| GET/PUT/DELETE | /api/patients/:id | Get / update / delete patient |
| GET/POST | /api/patients/:id/heartbeat | History / add reading |
| GET | /api/patients/:id/heartbeat/latest | Latest BPM |
| GET/POST | /api/patients/:id/family | List / add family member |
| PUT | /api/patients/:id/family/:memberId/face | Upload face photo |
| PUT | /api/patients/:id/family/:memberId/voice | Upload voice recording |
| POST | /api/patients/:id/family/recognize | Face recognition |
| GET/POST | /api/patients/:id/medications | List / add medication |
| GET | /api/patients/:id/medications/today | Today's schedule + status |
| PUT/DELETE | /api/patients/:id/medications/:medId | Update / delete medication |
| POST | /api/patients/:id/medications/:medId/schedules/:scheduleId/log | Mark taken/missed |
| POST | /api/patients/:id/medications/detect | Object detection (mock) |
