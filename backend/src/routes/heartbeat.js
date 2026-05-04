const express = require('express');
const { getDb, ObjectId } = require('../database/init');
const authMiddleware = require('../middleware/auth');
const { findLinkedPatient } = require('../utils/patientAccess');

const router = express.Router({ mergeParams: true });

function getBridgeToken() {
  return process.env.HEARTBEAT_BRIDGE_TOKEN || process.env.POLAR_H10_BRIDGE_TOKEN || '';
}

function verifyBridgeRequest(req, res) {
  const expectedToken = getBridgeToken();
  if (!expectedToken) {
    res.status(503).json({ error: 'Heartbeat bridge is not configured on this server' });
    return false;
  }

  const providedToken = req.header('x-bridge-token') || req.body?.bridge_token || '';
  if (providedToken !== expectedToken) {
    res.status(401).json({ error: 'Invalid bridge token' });
    return false;
  }

  return true;
}

async function storeHeartbeatReading(db, patientId, bpm, { source = 'sensor', device_name = null } = {}) {
  const now = new Date();

  const result = await db.collection('heartbeat_readings').insertOne({
    patient_id: patientId,
    heart_rate: bpm,
    threshold: 120,
    status: bpm >= 120 ? 'alert_triggered' : 'live',
    alert_triggered: bpm >= 120,
    source,
    device_name,
    recorded_at: now,
    updated_at: now,
  });

  await db.collection('heartbeat_latest').updateOne(
    { patient_id: patientId },
    { $set: { patient_id: patientId, heart_rate: bpm, threshold: 120, status: bpm >= 120 ? 'alert_triggered' : 'live', alert_triggered: bpm >= 120, source, device_name, recorded_at: now, updated_at: now } },
    { upsert: true }
  );

  if (bpm >= 120) {
    await db.collection('heartbeat_alerts').insertOne({
      patient_id: patientId,
      heart_rate: bpm,
      threshold: 120,
      triggered_at: now,
      status: 'triggered',
    });
  }

  return db.collection('heartbeat_readings').findOne({ _id: result.insertedId });
}

function toDoc(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    patient_id: doc.patient_id,
    bpm: doc.heart_rate,
    timestamp: doc.recorded_at,
    source: doc.source || 'sensor',
    device_name: doc.device_name || null,
  };
}

async function getPatient(req, res) {
  try {
    const patient = await findLinkedPatient(getDb(), req.guardian.id, req.params.patientId);
    if (!patient) { res.status(404).json({ error: 'Patient not found' }); return null; }
    return patient;
  } catch {
    res.status(400).json({ error: 'Invalid patient ID' });
    return null;
  }
}

// Add heartbeat reading
router.post('/', authMiddleware, async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const bpm = Number(req.body.bpm);
    const source = typeof req.body.source === 'string' && req.body.source.trim() ? req.body.source.trim() : 'sensor';
    const device_name = typeof req.body.device_name === 'string' && req.body.device_name.trim() ? req.body.device_name.trim() : null;
    if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) return res.status(400).json({ error: 'Invalid BPM value' });

    const patientId = patient._id.toString();
    const db = getDb();
    res.status(201).json(toDoc(await storeHeartbeatReading(db, patientId, bpm, { source, device_name })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bridge ingest endpoint for Expo Go-compatible Polar H10 bridge service
router.post('/bridge', async (req, res) => {
  try {
    if (!verifyBridgeRequest(req, res)) return;

    const patientId = String(req.body.patient_id || '').trim();
    const bpm = Number(req.body.bpm);
    const deviceName = typeof req.body.device_name === 'string' && req.body.device_name.trim() ? req.body.device_name.trim() : 'Polar H10';

    if (!patientId) return res.status(400).json({ error: 'patient_id is required' });
    if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) return res.status(400).json({ error: 'Invalid BPM value' });

    const db = getDb();
    const patient = await db.collection('patients').findOne({ _id: new ObjectId(patientId) });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const saved = await storeHeartbeatReading(db, patientId, bpm, { source: 'polar_h10_bridge', device_name: deviceName });
    res.status(201).json(toDoc(saved));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get heartbeat history (last 100 readings)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const readings = await getDb().collection('heartbeat_readings')
      .find({ patient_id: patient._id.toString() })
      .sort({ recorded_at: -1 })
      .limit(100)
      .toArray();
    res.json(readings.map(toDoc));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get latest reading
router.get('/latest', authMiddleware, async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const reading = await getDb().collection('heartbeat_latest').findOne({ patient_id: patient._id.toString() });
    res.json(reading ? toDoc(reading) : null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
