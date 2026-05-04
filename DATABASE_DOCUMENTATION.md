# MongoDB Database Documentation

## Overview

The project uses MongoDB Atlas as the only database backend. The Node.js/Express server connects through the official `mongodb` driver in `backend/src/database/init.js` and initializes the shared database handle before starting the API server.

## Connection Details

Environment variables live in `backend/.env`:

```env
MONGODB_URL=mongodb+srv://Alzemora:alzemora2026@cluster0.admj5gd.mongodb.net/?appName=Cluster0
MONGODB_DB_NAME=Alzemora
PORT=3000
JWT_SECRET=change_this_to_a_strong_random_secret
```

The backend falls back to the same Atlas URI and database name if the variables are not set, but `.env` is the preferred configuration.

## Backend Integration

- **Framework**: Node.js + Express
- **Driver**: mongodb 6.x
- **Connection lifecycle**: `connect()` runs on startup in `backend/src/index.js`
- **Database handle**: exposed through `getDb()` from `backend/src/database/init.js`

## Collections Used By The App

### `users`
Stores patient profiles.

Key fields: `_id`, `guardian_id`, `full_name`, `role`, `age`, `gender`, `diagnosis_date`, `emergency_contact`, `blood_type`, `notes`, `profile_image`, `status`, `created_at`

### `guardians`
Stores guardian accounts.

Key fields: `_id`, `full_name`, `email`, `password`, `role`, `patient_links`, `created_at`

### `people`
Stores known family members / contacts for face and voice features.

Key fields: `_id`, `user_id`, `name`, `relation`, `photo_url`, `voice`, `face_embedding`, `voice_embedding`, `permissions`, `created_at`

### `medications`
Stores medication records and schedule definitions.

Key fields: `_id`, `user_id`, `name`, `photo_url`, `dosage`, `notes`, `schedules`, `is_active`, `created_at`

### `medication_logs`
Stores daily medication status updates.

Key fields: `_id`, `medication_id`, `schedule_id`, `date`, `status`, `taken_at`

### `heartbeat_readings`
Stores the full heartbeat history.

Key fields: `_id`, `patient_id`, `heart_rate`, `threshold`, `status`, `alert_triggered`, `source`, `recorded_at`, `updated_at`

### `heartbeat_latest`
Stores the latest heartbeat reading for each patient.

### `heartbeat_alerts`
Stores heartbeat readings that crossed the alert threshold.

## Connection Example

```javascript
const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGODB_URL);
await client.connect();

const db = client.db(process.env.MONGODB_DB_NAME);
const user = await db.collection('users').findOne({ email: 'patient@example.com' });
```

## Notes

- There is no SQLite configuration or storage layer in the current codebase.
- The database name should remain `Alzemora` unless the Atlas deployment changes.