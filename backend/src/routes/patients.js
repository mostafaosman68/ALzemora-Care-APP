const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb, ObjectId } = require('../database/init');
const authMiddleware = require('../middleware/auth');
const { findLinkedPatient, listLinkedPatients } = require('../utils/patientAccess');

const router = express.Router();
const UPLOADS_ROOT = path.join(__dirname, '../../../uploads');

function safeFolderName(name) {
  return (name || 'unknown').trim().replace(/[\\/:\*\?"<>|]+/g, '').replace(/\s+/g, '_') || 'unknown';
}

// Pre-middleware: fetch patient name before multer runs (needed for update routes)
async function fetchPatientName(req, res, next) {
  if (req.params.id) {
    try {
      const patient = await getDb().collection('users').findOne({ _id: new ObjectId(req.params.id) });
      req._patientName = patient ? patient.full_name : null;
    } catch {}
  }
  next();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const name = req._patientName || req.body.name || 'unknown';
    const dir = path.join(UPLOADS_ROOT, 'patients', safeFolderName(name));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function relPath(req) {
  return req.file ? '/uploads/' + path.relative(UPLOADS_ROOT, req.file.path).replace(/\\/g, '/') : null;
}

function toDoc(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    name: doc.full_name,
    age: doc.age,
    gender: doc.gender,
    diagnosis_date: doc.diagnosis_date,
    emergency_contact: doc.emergency_contact,
    blood_type: doc.blood_type,
    notes: doc.notes,
    photo_path: doc.profile_image || null,
    created_at: doc.created_at,
  };
}

async function requirePatientAccess(req, res) {
  try {
    const patient = await findLinkedPatient(getDb(), req.guardian.id, req.params.id);
    if (!patient) { res.status(404).json({ error: 'Patient not found' }); return null; }
    return patient;
  } catch {
    res.status(400).json({ error: 'Invalid patient ID' });
    return null;
  }
}

// List all patients for guardian
router.get('/', authMiddleware, async (req, res) => {
  try {
    const patients = await listLinkedPatients(getDb(), req.guardian.id);
    res.json(patients.map(toDoc));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create patient
router.post('/', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    const { name, age, gender, diagnosis_date, emergency_contact, blood_type, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Patient name is required' });

    const db = getDb();
    const result = await db.collection('users').insertOne({
      guardian_id: req.guardian.id,
      full_name: name,
      role: 'User',
      age: age ? parseInt(age) : null,
      gender: gender || null,
      diagnosis_date: diagnosis_date || null,
      emergency_contact: emergency_contact || null,
      blood_type: blood_type || null,
      notes: notes || null,
      profile_image: relPath(req),
      status: 'active',
      created_at: new Date(),
    });

    // Keep guardian's patient_links in sync with the FastAPI backend's schema
    await db.collection('guardians').updateOne(
      { _id: new ObjectId(req.guardian.id) },
      { $addToSet: { patient_links: { patient_id: result.insertedId.toString(), patient_name: name } } }
    );

    res.status(201).json(toDoc(await db.collection('users').findOne({ _id: result.insertedId })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get single patient
router.get('/:id', authMiddleware, async (req, res) => {
  const patient = await requirePatientAccess(req, res);
  if (patient) res.json(toDoc(patient));
});

// Update patient
router.put('/:id', authMiddleware, fetchPatientName, upload.single('photo'), async (req, res) => {
  try {
    const patient = await requirePatientAccess(req, res);
    if (!patient) return;
    const { name, age, gender, diagnosis_date, emergency_contact, blood_type, notes } = req.body;
    const db = getDb();
    await db.collection('users').updateOne({ _id: patient._id }, {
      $set: {
        full_name: name || patient.full_name,
        age: age ? parseInt(age) : patient.age,
        gender: gender || patient.gender,
        diagnosis_date: diagnosis_date || patient.diagnosis_date,
        emergency_contact: emergency_contact || patient.emergency_contact,
        blood_type: blood_type || patient.blood_type,
        notes: notes || patient.notes,
        profile_image: relPath(req) || patient.profile_image,
      },
    });
    res.json(toDoc(await db.collection('users').findOne({ _id: patient._id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete patient
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const patient = await requirePatientAccess(req, res);
    if (!patient) return;
    await getDb().collection('users').deleteOne({ _id: patient._id });
    res.json({ message: 'Patient deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
