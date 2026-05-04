const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { getDb, ObjectId } = require('../database/init');
const authMiddleware = require('../middleware/auth');
const { findLinkedPatient } = require('../utils/patientAccess');

const router = express.Router({ mergeParams: true });
const UPLOADS_ROOT = path.join(__dirname, '../../../uploads');
const FACES_UPLOAD_ROOT = path.join(UPLOADS_ROOT, 'faces');
const VOICES_UPLOAD_ROOT = path.join(UPLOADS_ROOT, 'voices');

function getMlServiceUrl() {
  if (process.env.ML_SERVICE_URL) {
    return process.env.ML_SERVICE_URL.replace(/\/$/, '');
  }

  const host = process.env.ML_SERVICE_HOST || '127.0.0.1';
  const port = process.env.ML_SERVICE_PORT || '5000';
  const apiPath = (process.env.ML_SERVICE_PATH || '/api').replace(/^\/+/, '/');
  return `http://${host}:${port}${apiPath}`.replace(/\/$/, '');
}

function safeFolderName(name) {
  return (name || 'unknown').trim().replace(/[\\/:\*\?"<>|]+/g, '').replace(/\s+/g, '_') || 'unknown';
}

function getPatientFolderName(patient) {
  return safeFolderName(patient?.name || 'unknown');
}

function getStoredAbsolutePath(filePath) {
  if (!filePath) return null;
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(__dirname, '../../../', filePath.replace(/^\//, ''));
}

function getPatientPersonPath(patientFolder, personName, mediaType) {
  const baseRoot = mediaType === 'voices' ? VOICES_UPLOAD_ROOT : FACES_UPLOAD_ROOT;
  return path.join(baseRoot, safeFolderName(personName));
}

function copyFileIfNeeded(sourcePath, destinationPath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return false;
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  if (path.resolve(sourcePath) !== path.resolve(destinationPath)) {
    fs.copyFileSync(sourcePath, destinationPath);
  }
  return true;
}

async function postToMlService(endpoint, body, headers = {}) {
  const ML_SERVICE_URL = getMlServiceUrl();
  try {
    return await fetch(`${ML_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body,
    });
  } catch (error) {
    console.warn(`[Family] ML service unavailable at ${ML_SERVICE_URL}${endpoint}:`, error.message);
    return null;
  }
}

async function clearMlEmbeddings() {
  await postToMlService('/clear_embeddings');
}

async function registerEmbeddingInMlService(kind, personName, embedding) {
  if (!personName || !Array.isArray(embedding) || embedding.length === 0) {
    return false;
  }

  const endpoint = kind === 'voice' ? '/register_voice' : '/register_face';
  const response = await postToMlService(
    endpoint,
    JSON.stringify({ person_name: personName, embedding }),
    { 'Content-Type': 'application/json' }
  );

  if (!response) {
    return false;
  }

  return response.ok;
}

async function fetchPatientContext(req, res, next) {
  try {
    const patient = await findLinkedPatient(getDb(), req.guardian.id, req.params.patientId);
    if (patient) {
      req._patient = patient;
      req._patientFolder = getPatientFolderName(patient);
    }
  } catch {}
  next();
}

// Pre-middleware: fetch member name from DB before multer runs
async function fetchMemberName(req, res, next) {
  if (req.params.memberId) {
    try {
      const member = await getDb().collection('people').findOne({ _id: new ObjectId(req.params.memberId) });
      req._memberName = member ? member.name : null;
    } catch {}
  }
  next();
}

const faceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const patientFolder = req._patientFolder || 'unknown';
    const name = req._memberName || req.body.name || 'unknown';
    const dir = getPatientPersonPath(patientFolder, name, 'faces');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, 'photo.jpg'),
});

const voiceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const patientFolder = req._patientFolder || 'unknown';
    const name = req._memberName || req.body.name || 'unknown';
    const dir = getPatientPersonPath(patientFolder, name, 'voices');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, 'voice.wav'),
});

const faceUpload = multer({ storage: faceStorage, limits: { fileSize: 10 * 1024 * 1024 } });
const voiceUpload = multer({ storage: voiceStorage, limits: { fileSize: 50 * 1024 * 1024 } });

const memberUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const patientFolder = req._patientFolder || 'unknown';
      const name = safeFolderName(req.body.name || 'unknown');
      const rootFolder = file.fieldname === 'voice' ? 'voices' : 'faces';
      const dir = getPatientPersonPath(patientFolder, name, rootFolder);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, file.fieldname === 'voice' ? 'voice.wav' : 'photo.jpg');
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

function relPath(req) {
  return req.file ? '/uploads/' + path.relative(UPLOADS_ROOT, req.file.path).replace(/\\/g, '/') : null;
}

function fileRelPath(filePath) {
  return filePath ? '/uploads/' + path.relative(UPLOADS_ROOT, filePath).replace(/\\/g, '/') : null;
}

function removeFileIfExists(filePath) {
  if (!filePath) return;

  const absolutePath = path.join(__dirname, '../../../', filePath.replace(/^\//, ''));
  try {
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }

    const directory = path.dirname(absolutePath);
    if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
      fs.rmdirSync(directory);
    }
  } catch (error) {
    console.warn('[Family] Failed to remove file:', error.message);
  }
}

function removePersonFolders(patientFolder, name) {
  const folderName = safeFolderName(name);
  const facesDir = path.join(FACES_UPLOAD_ROOT, folderName);
  const voicesDir = path.join(VOICES_UPLOAD_ROOT, folderName);
  [facesDir, voicesDir].forEach((dir) => {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn('[Family] Failed to remove folder:', error.message);
    }
  });
}

async function syncPatientMediaFromDb(patient) {
  const db = getDb();
  const members = await db.collection('people').find({ user_id: patient._id.toString() }).toArray();
  let faceCount = 0;
  let voiceCount = 0;

  await clearMlEmbeddings();

  for (const member of members) {
    if (member.face_embedding) {
      const ok = await registerEmbeddingInMlService('face', member.name, member.face_embedding);
      if (ok) faceCount += 1;
    }

    if (member.voice_embedding) {
      const ok = await registerEmbeddingInMlService('voice', member.name, member.voice_embedding);
      if (ok) voiceCount += 1;
    }
  }

  return { members: members.length, faces: faceCount, voices: voiceCount };
}

// Map MongoDB doc → frontend-expected shape
function toDoc(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    patient_id: doc.user_id,
    name: doc.name,
    relationship: doc.relation,       // MongoDB stores as 'relation', frontend expects 'relationship'
    face_photo_path: doc.photo_url || null,
    voice_path: doc.voice || null,
    created_at: doc.created_at,
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

// Get all family members
router.get('/', authMiddleware, async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const members = await getDb().collection('people')
      .find({ user_id: patient._id.toString() })
      .sort({ name: 1 })
      .toArray();

    setImmediate(() => {
      syncPatientMediaFromDb(patient).catch((error) => {
        console.warn('[Family] Background sync failed:', error.message);
      });
    });

    res.json(members.map(toDoc));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create family member
router.post('/', authMiddleware, fetchPatientContext, memberUpload.any(), async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;

    const { name, relationship } = req.body;
    if (!name || !relationship) return res.status(400).json({ error: 'Name and relationship are required' });

    const faceFile = req.files?.find(f => f.fieldname === 'face_photo') || null;
    const voiceFile = req.files?.find(f => f.fieldname === 'voice') || null;
    const facePath = faceFile ? fileRelPath(faceFile.path) : null;
    const voicePath = voiceFile ? fileRelPath(voiceFile.path) : null;

    const db = getDb();
    const result = await db.collection('people').insertOne({
      user_id: patient._id.toString(),
      name,
      relation: relationship,
      photo_url: facePath,
      voice: voicePath,
      face_embedding: null,
      voice_embedding: null,
      permissions: null,
      created_at: new Date(),
    });

    await Promise.all([
      faceFile?.path ? extractAndStoreFaceEmbedding(result.insertedId.toString(), faceFile.path) : Promise.resolve(null),
      voiceFile?.path ? extractAndStoreVoiceEmbedding(result.insertedId.toString(), voiceFile.path) : Promise.resolve(null),
    ]);

    // Refresh ML cache from stored embeddings (synchronous so embeddings are immediately available)
    await syncPatientMediaFromDb(patient);

    res.status(201).json(toDoc(await db.collection('people').findOne({ _id: result.insertedId })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update face photo for family member
router.put('/:memberId/face', authMiddleware, fetchPatientContext, fetchMemberName, faceUpload.single('face_photo'), async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const db = getDb();
    const member = await db.collection('people').findOne({
      _id: new ObjectId(req.params.memberId),
      user_id: patient._id.toString(),
    });
    if (!member) return res.status(404).json({ error: 'Family member not found' });

    await db.collection('people').updateOne(
      { _id: member._id },
      { $set: { photo_url: relPath(req) || member.photo_url } }
    );

    if (req.file && req.file.path) {
      setImmediate(() => extractAndStoreFaceEmbedding(member._id.toString(), req.file.path));
      setImmediate(() => syncPatientMediaFromDb(patient));
    }

    res.json(toDoc(await db.collection('people').findOne({ _id: member._id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Upload voice for family member
router.put('/:memberId/voice', authMiddleware, fetchPatientContext, fetchMemberName, voiceUpload.single('voice'), async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const db = getDb();
    const member = await db.collection('people').findOne({
      _id: new ObjectId(req.params.memberId),
      user_id: patient._id.toString(),
    });
    if (!member) return res.status(404).json({ error: 'Family member not found' });
    if (!req.file) return res.status(400).json({ error: 'Voice file required' });

    await db.collection('people').updateOne(
      { _id: member._id },
      { $set: { voice: relPath(req) } }
    );

    if (req.file && req.file.path) {
      setImmediate(() => extractAndStoreVoiceEmbedding(member._id.toString(), req.file.path));
      setImmediate(() => syncPatientMediaFromDb(patient));
    }

    res.json(toDoc(await db.collection('people').findOne({ _id: member._id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete voice recording for family member
router.delete('/:memberId/voice', authMiddleware, async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;

    const db = getDb();
    const member = await db.collection('people').findOne({
      _id: new ObjectId(req.params.memberId),
      user_id: patient._id.toString(),
    });
    if (!member) return res.status(404).json({ error: 'Family member not found' });

    removeFileIfExists(member.voice);

    await db.collection('people').updateOne(
      { _id: member._id },
      { $set: { voice: null, voice_embedding: null } }
    );

    res.json(toDoc(await db.collection('people').findOne({ _id: member._id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update member info (name / relationship)
router.put('/:memberId', authMiddleware, async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const db = getDb();
    const member = await db.collection('people').findOne({
      _id: new ObjectId(req.params.memberId),
      user_id: patient._id.toString(),
    });
    if (!member) return res.status(404).json({ error: 'Family member not found' });

    const { name, relationship } = req.body;
    await db.collection('people').updateOne({ _id: member._id }, {
      $set: {
        name: name || member.name,
        relation: relationship || member.relation,
      },
    });
    res.json(toDoc(await db.collection('people').findOne({ _id: member._id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete family member
router.delete('/:memberId', authMiddleware, async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const db = getDb();
    const member = await db.collection('people').findOne({
      _id: new ObjectId(req.params.memberId),
      user_id: patient._id.toString(),
    });
    if (!member) return res.status(404).json({ error: 'Family member not found' });
    removeFileIfExists(member.photo_url);
    removeFileIfExists(member.voice);
    removePersonFolders(getPatientFolderName(patient), member.name);
    await db.collection('people').deleteOne({ _id: member._id });
    res.json({ message: 'Family member deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Multimodal face + voice recognition endpoint
// Accepts either:
// 1. multipart/form-data with 'image' file (for camera/photo upload)
// 2. application/json with 'imageBase64' or 'imageBuffer' (for direct camera stream)
// NOTE: Does NOT save files to disk or database - only recognizes
router.post('/recognize', authMiddleware, (req, res, next) => {
  // Use multer only if multipart data is present, otherwise skip
  if (req.is('multipart/form-data')) {
    faceUpload.single('image')(req, res, next);
  } else {
    next();
  }
}, async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;

    const db = getDb();
    const members = await db.collection('people')
      .find({ user_id: patient._id.toString() })
      .toArray();

    if (members.length === 0) {
      return res.json({ recognized: false, message: 'No members registered', confidence: 0 });
    }

    const ML_SERVICE_URL = getMlServiceUrl();

    // Check ML service health
    try {
      const healthRes = await fetch(`${ML_SERVICE_URL}/health`);
      if (!healthRes.ok) {
        console.warn('[Family] ML service not available');
        return res.json({ recognized: false, message: 'ML service unavailable', fallback: true });
      }
    } catch (e) {
      console.warn('[Family] ML service connection error:', e.message);
      return res.json({ recognized: false, message: 'ML service unavailable', fallback: true });
    }

    // Load registered member embeddings into ML service cache
    for (const member of members) {
      if (member.face_embedding) {
        try {
          await fetch(`${ML_SERVICE_URL}/register_face`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              person_name: member.name,
              embedding: member.face_embedding
            })
          });
        } catch (e) {
          console.error(`[Family] Failed to load face for ${member.name}:`, e.message);
        }
      }

      if (member.voice_embedding) {
        try {
          await fetch(`${ML_SERVICE_URL}/register_voice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              person_name: member.name,
              embedding: member.voice_embedding
            })
          });
        } catch (e) {
          console.error(`[Family] Failed to load voice for ${member.name}:`, e.message);
        }
      }
    }

    let imageBuffer = null;
    let imageSource = null;

    // Handle camera/multipart image upload
    if (req.file) {
      imageBuffer = require('fs').readFileSync(req.file.path);
      imageSource = 'multipart_upload';
      // Clean up: don't save, but buffer is in memory
      try {
        require('fs').unlinkSync(req.file.path);
      } catch (e) {
        // File cleanup is optional
      }
    }
    // Handle base64 image from camera
    else if (req.body && req.body.imageBase64) {
      imageBuffer = Buffer.from(req.body.imageBase64, 'base64');
      imageSource = 'camera_base64';
    }
    // Handle binary image buffer
    else if (req.body && req.body.imageBuffer) {
      imageBuffer = Buffer.from(req.body.imageBuffer);
      imageSource = 'camera_buffer';
    }

    if (!imageBuffer) {
      return res.status(400).json({
        error: 'Image required for recognition',
        hint: 'Send either: multipart with "image" file, or JSON with "imageBase64" or "imageBuffer"'
      });
    }

    // Send to ML service for recognition (no file saving)
    const FormData = require('form-data');
    const Readable = require('stream').Readable;

    const formData = new FormData();
    const stream = Readable.from(imageBuffer);
    formData.append('image', stream, { filename: 'recognition.jpg' });

    try {
      const mlRes = await fetch(`${ML_SERVICE_URL}/recognize_face`, {
        method: 'POST',
        body: formData
      });

      if (!mlRes.ok) {
        const error = await mlRes.json();
        console.error('[Family] ML recognition error:', error);
        return res.json({
          recognized: false,
          message: error.message || 'Recognition failed',
          confidence: 0,
          source: imageSource
        });
      }

      const result = await mlRes.json();

      // Find matching member in DB
      if (result.recognized && result.person && result.person !== 'Unknown') {
        const matchedMember = members.find(m => m.name === result.person);
        if (matchedMember) {
          return res.json({
            recognized: true,
            member: toDoc(matchedMember),
            confidence: result.score || result.raw_score,
            mode: result.mode || 'face_only',
            source: imageSource
          });
        }
      }

      return res.json({
        recognized: false,
        message: result.message || 'Unknown face',
        confidence: result.score || 0,
        mode: result.mode || 'unknown',
        source: imageSource
      });

    } catch (e) {
      console.error('[Family] ML service request error:', e.message);
      return res.json({
        recognized: false,
        message: 'Recognition error: ' + e.message,
        confidence: 0,
        source: imageSource
      });
    }

  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Extract and store face embedding when uploading face photo
async function extractAndStoreFaceEmbedding(memberId, imagePath) {
  try {
    const fs = require('fs');

    const formData = new (require('form-data'))();
    formData.append('image', fs.createReadStream(imagePath));

    const res = await postToMlService('/extract_face_embedding', formData);

    if (!res) {
      return null;
    }

    if (!res.ok) {
      console.error('[Family] Failed to extract face embedding:', res.status);
      return null;
    }

    const data = await res.json();
    if (data.embedding) {
      // Store embedding in MongoDB
      const db = getDb();
      await db.collection('people').updateOne(
        { _id: new (require('mongodb')).ObjectId(memberId) },
        { $set: { face_embedding: data.embedding } }
      );
      console.log('[Family] Face embedding extracted and stored');
      return data.embedding;
    }
  } catch (e) {
    console.error('[Family] Error extracting face embedding:', e.message);
  }
  return null;
}

// Extract and store voice embedding when uploading voice
async function extractAndStoreVoiceEmbedding(memberId, voicePath) {
  try {
    const fs = require('fs');

    const formData = new (require('form-data'))();
    formData.append('audio', fs.createReadStream(voicePath));

    const res = await postToMlService('/extract_voice_embedding', formData);

    if (!res) {
      return null;
    }

    if (!res.ok) {
      console.error('[Family] Failed to extract voice embedding:', res.status);
      return null;
    }

    const data = await res.json();
    if (data.embedding) {
      // Store embedding in MongoDB
      const db = getDb();
      await db.collection('people').updateOne(
        { _id: new (require('mongodb')).ObjectId(memberId) },
        { $set: { voice_embedding: data.embedding } }
      );
      console.log('[Family] Voice embedding extracted and stored');
      return data.embedding;
    }
  } catch (e) {
    console.error('[Family] Error extracting voice embedding:', e.message);
  }
  return null;
}

// Update face endpoint to extract embedding
router.put('/:memberId/face', authMiddleware, fetchMemberName, faceUpload.single('face_photo'), async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const db = getDb();
    const { ObjectId } = require('mongodb');
    const member = await db.collection('people').findOne({
      _id: new ObjectId(req.params.memberId),
      user_id: patient._id.toString(),
    });
    if (!member) return res.status(404).json({ error: 'Family member not found' });

    const photoPath = relPath(req) || member.photo_url;
    await db.collection('people').updateOne(
      { _id: member._id },
      { $set: { photo_url: photoPath } }
    );

    // Extract embedding in background
    if (req.file && req.file.path) {
      setImmediate(() => extractAndStoreFaceEmbedding(member._id.toString(), req.file.path));
      setImmediate(() => syncPatientMediaFromDb(patient));
    }

    res.json(toDoc(await db.collection('people').findOne({ _id: member._id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update voice endpoint to extract embedding
router.put('/:memberId/voice', authMiddleware, fetchMemberName, voiceUpload.single('voice'), async (req, res) => {
  try {
    const patient = await getPatient(req, res);
    if (!patient) return;
    const db = getDb();
    const { ObjectId } = require('mongodb');
    const member = await db.collection('people').findOne({
      _id: new ObjectId(req.params.memberId),
      user_id: patient._id.toString(),
    });
    if (!member) return res.status(404).json({ error: 'Family member not found' });
    if (!req.file) return res.status(400).json({ error: 'Voice file required' });

    await db.collection('people').updateOne(
      { _id: member._id },
      { $set: { voice: relPath(req) } }
    );

    if (req.file && req.file.path) {
      setImmediate(() => extractAndStoreVoiceEmbedding(member._id.toString(), req.file.path));
      setImmediate(() => syncPatientMediaFromDb(patient));
    }

    res.json(toDoc(await db.collection('people').findOne({ _id: member._id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
