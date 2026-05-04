# MongoDB Quick Reference - For AI/Developer Integration

## Credentials

```text
Connection String: mongodb+srv://Alzemora:alzemora2026@cluster0.admj5gd.mongodb.net/?appName=Cluster0
Database Name: Alzemora
Username: Alzemora
Password: alzemora2026
```

## Collections Overview

| Collection | Purpose | Key Field |
|---|---|---|
| `users` | Patient profiles | `_id`, `guardian_id`, `full_name` |
| `guardians` | Guardian accounts | `_id`, `email` |
| `people` | Known family members / contacts | `_id`, `user_id` |
| `medications` | Medication records | `_id`, `user_id` |
| `medication_logs` | Daily medication status | `_id`, `medication_id`, `schedule_id`, `date` |
| `heartbeat_readings` | Heart rate history | `_id`, `patient_id` |
| `heartbeat_latest` | Latest heart rate per patient | `patient_id` |
| `heartbeat_alerts` | Heartbeat alerts | `_id`, `patient_id` |

## Current Backend Connection

```javascript
const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGODB_URL);
await client.connect();
const db = client.db(process.env.MONGODB_DB_NAME);
```

The shared database connection is created in `backend/src/database/init.js` and used throughout the Express routes.

## Common Queries

```javascript
db.collection('users').findOne({ email: 'patient@example.com' })
db.collection('guardians').find({ 'patient_links.patient_id': 'patient_id_here' })
db.collection('heartbeat_latest').findOne({ patient_id: 'patient_id_here' })
db.collection('people').find({ user_id: 'patient_id_here' })
db.collection('medication_logs').find({ date: '2026-05-02' })
```

## Relationship Map

```text
users (Patient)
  ├── Guardians → guardians.collection via patient_links
  ├── People → people.collection via user_id
  ├── Medications → medications.collection via user_id
  ├── Medication Logs → medication_logs.collection via medication_id / schedule_id
  ├── Heart Readings → heartbeat_readings.collection via patient_id
  ├── Latest Heart Rate → heartbeat_latest.collection via patient_id
  └── Heart Alerts → heartbeat_alerts.collection via patient_id
```