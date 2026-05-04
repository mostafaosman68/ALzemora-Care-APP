const { ObjectId } = require('../database/init');

function uniqueById(docs) {
  const seen = new Set();
  const result = [];

  for (const doc of docs) {
    if (!doc) continue;
    const id = doc._id.toString();
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(doc);
  }

  return result;
}

async function getGuardian(db, guardianId) {
  return db.collection('guardians').findOne({ _id: new ObjectId(guardianId) });
}

async function findLinkedPatient(db, guardianId, patientId) {
  const directMatch = await db.collection('users').findOne({
    _id: new ObjectId(patientId),
    guardian_id: guardianId,
  });

  if (directMatch) return directMatch;

  const guardian = await getGuardian(db, guardianId);
  if (!guardian) return null;

  const link = (guardian.patient_links || []).find(item => item.patient_id === patientId);
  if (!link) return null;

  return db.collection('users').findOne({ _id: new ObjectId(link.patient_id) });
}

async function findPatientByName(db, guardianId, patientName) {
  const trimmed = patientName.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // ✅ SECURITY: Only search in THIS guardian's patients (direct link)
  const directMatch = await db.collection('users').findOne({
    guardian_id: guardianId,
    full_name: { $regex: new RegExp(`^${escaped}$`, 'i') },
    role: 'User',
  });

  if (directMatch) return directMatch;

  // ✅ SECURITY: Only search in THIS guardian's patient_links
  const guardian = await getGuardian(db, guardianId);
  if (guardian) {
    const link = (guardian.patient_links || []).find(item => (item.patient_name || '').trim().toLowerCase() === trimmed.toLowerCase());
    if (link) {
      const linkedPatient = await db.collection('users').findOne({ 
        _id: new ObjectId(link.patient_id), 
        role: 'User' 
      });
      if (linkedPatient) return linkedPatient;
    }
  }

  // ✅ SECURITY: DO NOT fall back to searching all patients
  // Return null if patient not found in this guardian's patients
  return null;
}

async function listLinkedPatients(db, guardianId) {
  const guardian = await getGuardian(db, guardianId);
  const linkedIds = (guardian?.patient_links || [])
    .map(item => item.patient_id)
    .filter(Boolean);

  const linkedPatients = linkedIds.length
    ? await db.collection('users').find({ _id: { $in: linkedIds.map(id => new ObjectId(id)) }, role: 'User' }).toArray()
    : [];

  const guardianFieldPatients = await db.collection('users')
    .find({ guardian_id: guardianId, role: 'User' })
    .toArray();

  return uniqueById([...linkedPatients, ...guardianFieldPatients]).sort((left, right) =>
    (left.full_name || '').localeCompare(right.full_name || '', undefined, { sensitivity: 'base' })
  );
}

module.exports = { findLinkedPatient, findPatientByName, listLinkedPatients };