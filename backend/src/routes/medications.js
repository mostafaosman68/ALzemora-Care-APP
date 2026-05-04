const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb, ObjectId } = require('../database/init');
const authMiddleware = require('../middleware/auth');
const { findLinkedPatient } = require('../utils/patientAccess');

const router = express.Router({ mergeParams: true });
const UPLOADS_ROOT = path.join(__dirname, '../../../uploads');

function safeFolderName(name) {
  return (name || 'unknown').trim().replace(/[\\/:\*\?"<>|]+/g, '').replace(/\s+/g, '_') || 'unknown';
}

// Pre-middleware: fetch medication name before multer runs (needed for update routes)
async function fetchMedName(req, res, next) {
  if (req.params.medId) {
    try {
      const med = await getDb().collection('medications').findOne({ _id: new ObjectId(req.params.medId) });
      req._medName = med ? med.name : null;
    } catch {}
  }
  next();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const name = req._medName || req.body.name || 'unknown';
    const dir = path.join(UPLOADS_ROOT, 'medications', safeFolderName(name));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `med-${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function relPath(req) {
  return req.file ? '/uploads/' + path.relative(UPLOADS_ROOT, req.file.path).replace(/\\/g, '/') : null;
}

function toDoc(doc, schedules) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    patient_id: doc.user_id,
    name: doc.name,
    photo_path: doc.photo_url || null,
    dosage: doc.dosage || null,
    notes: doc.notes || null,
    is_active: doc.is_active,
    created_at: doc.created_at,
    schedules: (schedules || doc.schedules || []).map(s => ({
      id: s._id ? s._id.toString() : s.id,
      time: s.time,
    })),
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

// Get all medications with schedules
router.get('/', authMiddleware, async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const meds = await getDb().collection('medications')
      .find({ user_id: patient._id.toString() })
      .sort({ name: 1 })
      .toArray();
    res.json(meds.map(m => toDoc(m)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get today's medications with log status
router.get('/today', authMiddleware, async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const today = new Date().toISOString().split('T')[0];
    const db = getDb();
    const meds = await db.collection('medications').find({ user_id: patient._id.toString() }).toArray();
    const result = [];

    for (const med of meds) {
      for (const schedule of (med.schedules || [])) {
        const scheduleId = schedule._id.toString();
        // Upsert a pending log if none exists for today
        await db.collection('medication_logs').updateOne(
          { schedule_id: scheduleId, date: today },
          { $setOnInsert: { medication_id: med._id.toString(), schedule_id: scheduleId, date: today, status: 'pending', taken_at: null } },
          { upsert: true }
        );
        const log = await db.collection('medication_logs').findOne({ schedule_id: scheduleId, date: today });
        result.push({
          medication: toDoc(med),
          schedule: { id: scheduleId, time: schedule.time },
          log: log ? { ...log, id: log._id.toString() } : null,
        });
      }
    }
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add medication
router.post('/', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const { name, dosage, notes, times } = req.body;
    if (!name) return res.status(400).json({ error: 'Medication name is required' });

    const timeList = times ? JSON.parse(times) : [];
    const schedules = timeList.map(t => ({ _id: new ObjectId(), time: t }));

    const db = getDb();
    const result = await db.collection('medications').insertOne({
      user_id: patient._id.toString(),
      name,
      photo_url: relPath(req),
      dosage: dosage || null,
      notes: notes || null,
      schedules,
      is_active: true,
      created_at: new Date(),
    });

    res.status(201).json(toDoc(await db.collection('medications').findOne({ _id: result.insertedId })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update medication
router.put('/:medId', authMiddleware, fetchMedName, upload.single('photo'), async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const db = getDb();
    const med = await db.collection('medications').findOne({
      _id: new ObjectId(req.params.medId),
      user_id: patient._id.toString(),
    });
    if (!med) return res.status(404).json({ error: 'Medication not found' });

    const { name, dosage, notes, times } = req.body;
    const update = {
      name: name || med.name,
      dosage: dosage || med.dosage,
      notes: notes || med.notes,
      photo_url: relPath(req) || med.photo_url,
    };

    if (times) {
      const timeList = JSON.parse(times);
      update.schedules = timeList.map(t => ({ _id: new ObjectId(), time: t }));
    }

    await db.collection('medications').updateOne({ _id: med._id }, { $set: update });
    res.json(toDoc(await db.collection('medications').findOne({ _id: med._id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete medication
router.delete('/:medId', authMiddleware, async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const db = getDb();
    const med = await db.collection('medications').findOne({
      _id: new ObjectId(req.params.medId),
      user_id: patient._id.toString(),
    });
    if (!med) return res.status(404).json({ error: 'Medication not found' });
    await db.collection('medications').deleteOne({ _id: med._id });
    res.json({ message: 'Medication deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mark medication as taken / missed
router.post('/:medId/schedules/:scheduleId/log', authMiddleware, async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const { status, date } = req.body;
    const today = date || new Date().toISOString().split('T')[0];
    const taken_at = status === 'taken' ? new Date() : null;

    await getDb().collection('medication_logs').updateOne(
      { schedule_id: req.params.scheduleId, date: today },
      { $set: { medication_id: req.params.medId, status: status || 'taken', taken_at } },
      { upsert: true }
    );
    res.json({ message: 'Log updated', status: status || 'taken' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mock object detection for medication photo
router.post('/detect', authMiddleware, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Photo required' });
  res.json({
    detected: true,
    suggestion: 'Medication detected',
    confidence: (Math.random() * 0.15 + 0.85).toFixed(2),
  });
});

module.exports = router;
