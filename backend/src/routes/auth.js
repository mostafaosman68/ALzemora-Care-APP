const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb, ObjectId } = require('../database/init');
const authMiddleware = require('../middleware/auth');
const { findPatientByName, listLinkedPatients } = require('../utils/patientAccess');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'alzheimer_care_secret_2024';

function guardianDoc(doc) {
  return { id: doc._id.toString(), name: doc.full_name, email: doc.email, role: doc.role || 'Guardian' };
}

function patientDoc(doc) {
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

async function passwordMatches(plainPassword, storedPassword) {
  if (!storedPassword) return false;
  if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$')) {
    return bcrypt.compare(plainPassword, storedPassword);
  }
  return plainPassword === storedPassword;
}

// Register guardian or caregiver
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required' });

    const accountRole = role === 'Caregiver' ? 'Caregiver' : 'Guardian';

    const db = getDb();
    if (await db.collection('guardians').findOne({ email }))
      return res.status(409).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);
    const result = await db.collection('guardians').insertOne({
      full_name: name,
      email,
      password: hashed,
      role: accountRole,
      patient_links: [],
      created_at: new Date(),
    });

    const id = result.insertedId.toString();
    const token = jwt.sign({ id, name, email, role: accountRole }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, guardian: { id, name, email, role: accountRole } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login — requires email, password, role, and patient name
router.post('/login', async (req, res) => {
  try {
    const { email, password, patientName, role } = req.body;
    if (!email || !password || !patientName)
      return res.status(400).json({ error: 'Email, password and patient name are required' });

    const db = getDb();
    const guardian = await db.collection('guardians').findOne({ email });
    if (!guardian) return res.status(401).json({ error: 'Invalid credentials' });

    const passwordOk = await passwordMatches(password, guardian.password);
    if (!passwordOk)
      return res.status(401).json({ error: 'Invalid credentials' });

    if (!(guardian.password || '').startsWith('$2a$') && !(guardian.password || '').startsWith('$2b$') && !(guardian.password || '').startsWith('$2y$')) {
      const hashed = await bcrypt.hash(password, 12);
      await db.collection('guardians').updateOne({ _id: guardian._id }, { $set: { password: hashed } });
    }

    // Validate role matches stored role if provided
    const storedRole = guardian.role || 'Guardian';
    if (role && role !== storedRole)
      return res.status(403).json({ error: `This account is registered as a ${storedRole}, not a ${role}` });

    const guardianId = guardian._id.toString();
    const patient = await findPatientByName(db, guardianId, patientName);

    if (!patient)
      return res.status(404).json({ error: `No patient named "${patientName}" found under your account` });

    const token = jwt.sign(
      { id: guardianId, name: guardian.full_name, email: guardian.email, role: storedRole },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      guardian: guardianDoc(guardian),
      currentPatient: patientDoc(patient),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current guardian profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const guardian = await getDb().collection('guardians').findOne({ _id: new ObjectId(req.guardian.id) });
    if (!guardian) return res.status(404).json({ error: 'Guardian not found' });
    res.json({ id: guardian._id.toString(), name: guardian.full_name, email: guardian.email, created_at: guardian.created_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all patients for this guardian (for switching)
router.get('/my-patients', authMiddleware, async (req, res) => {
  try {
    const patients = await listLinkedPatients(getDb(), req.guardian.id);
    res.json(patients.map(p => ({
      id: p._id.toString(),
      name: p.full_name,
      age: p.age,
      gender: p.gender,
      photo_path: p.profile_image || null,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
