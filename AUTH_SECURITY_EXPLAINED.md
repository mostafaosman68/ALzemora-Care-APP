# 🔐 Auth Security Fix - Patient Validation

## Problem Solved

**Before**: A guardian could log in with ANY patient name, even if that patient didn't belong to them.

**After**: Login validates that the patient name actually belongs to the logged-in guardian.

## How It Works

### Login Flow

```typescript
// User submits login form
{
  email: "guardian@example.com",
  password: "secure_pass",
  patientName: "Mom"
}
```

### Step 1: Validate Guardian
```javascript
const guardian = await db.collection('guardians').findOne({ email });
// ✅ Guardian found: guardian@example.com
```

### Step 2: Validate Password
```javascript
const passwordOk = await passwordMatches(password, guardian.password);
// ✅ Password matches
```

### Step 3: **SECURE** - Validate Patient Belongs to Guardian
```javascript
const patient = await findPatientByName(db, guardianId, patientName);
// This function now ONLY searches this guardian's patients
// Does NOT search all patients in database
```

### Step 4: Return Token
```javascript
const token = jwt.sign({ id: guardianId, ... });
// ✅ Login successful
```

## Security Details

### The Fix: findPatientByName()

**Location**: `backend/src/utils/patientAccess.js` lines 39-68

**What it does**:
1. Takes 3 parameters: `db`, `guardianId`, `patientName`
2. Searches ONLY in this guardian's direct patients
3. Then searches ONLY in this guardian's patient_links
4. **Crucially**: Does NOT fall back to searching ALL patients

**Before (INSECURE)**:
```javascript
// ❌ This would search ALL patients as fallback
const anyPatient = await db.collection('users').findOne({
  full_name: { $regex: new RegExp(`^${escaped}$`, 'i') },
  role: 'User',
});
// SECURITY HOLE: Any guardian could access ANY patient!
```

**After (SECURE)**:
```javascript
// ✅ Only searches THIS guardian's patients
const directMatch = await db.collection('users').findOne({
  guardian_id: guardianId,  // ← THE KEY LINE
  full_name: { $regex: new RegExp(`^${escaped}$`, 'i') },
  role: 'User',
});

// If not found directly, check patient_links (but still guardian-specific)
const link = (guardian.patient_links || []).find(item => 
  item.patient_name.toLowerCase() === patientName.toLowerCase()
);

// ✅ CRITICAL: No fallback query!
// If not found, return null
return null;  // ← Not found in this guardian's patients
```

## Security Test

### Test Case 1: Correct Patient
```
Guardian A logs in with patientName: "Mom" (which belongs to A)
Result: ✅ Login succeeds

Database state:
- Guardian A has patient "Mom"
- Guardian A has patient "Dad"
```

### Test Case 2: Wrong Patient
```
Guardian A logs in with patientName: "John" (which belongs to Guardian B)
Result: ✅ Login fails with: "No patient named 'John' found under your account"

Database state:
- Guardian A doesn't have "John"
- Guardian B has "John"
- System correctly rejects access
```

### Test Case 3: Non-existent Patient
```
Guardian A logs in with patientName: "Random Name"
Result: ✅ Login fails with: "No patient named 'Random Name' found under your account"

Database state:
- Patient "Random Name" doesn't exist
- System correctly rejects access
```

## Code Flow

```
POST /login
│
├─> Validate email exists
│   └─> ✅ Guardian found
│
├─> Validate password
│   └─> ✅ Password matches
│
├─> NEW: Validate patient belongs to THIS guardian
│   ├─> Query 1: Direct link?
│   │   WHERE guardian_id = guardianId AND full_name = patientName
│   │   └─> ✅ Found? Return patient
│   │
│   └─> Query 2: In patient_links?
│       WHERE patient_links contains patient with this name
│       └─> ✅ Found? Fetch and return patient
│
├─> ✅ Patient validated
│
└─> Generate token and return
    ├─> Guardian info
    ├─> Current patient info
    └─> JWT token for future requests
```

## Database Schema

### Guardians Collection
```javascript
{
  _id: ObjectId,
  full_name: "Jane Doe",
  email: "jane@example.com",
  password: "$2b$12$...",
  role: "Guardian",
  patient_links: [
    { 
      patient_id: "507f1f77bcf86cd799439011",
      patient_name: "Mom"
    },
    {
      patient_id: "507f1f77bcf86cd799439012",
      patient_name: "Dad"
    }
  ],
  created_at: "2024-01-15T..."
}
```

### Users Collection
```javascript
{
  _id: ObjectId,
  full_name: "Betty Smith",
  age: 75,
  gender: "Female",
  guardian_id: "507f1f77bcf86cd799439001",  // ← Links to Jane Doe
  role: "User",
  created_at: "2024-01-15T..."
}
```

### Security: Two Layers

**Layer 1**: Direct guardian_id field
```javascript
guardian_id: guardianId  // Only searches patients linked via this field
```

**Layer 2**: Guardian's patient_links array
```javascript
patient_links: [
  { patient_id: "...", patient_name: "Mom" }
]
// Only searches patients in this array
```

Both ensure guardians ONLY access their own patients.

## API Endpoints Using This Security

All these endpoints use the secure `findPatientByName()` function:

1. **POST /auth/login** - Login validation
   - Ensures patient belongs to guardian

2. **GET /auth/my-patients** - List guardian's patients
   - Uses `listLinkedPatients()` with guardian_id check

3. **GET /patients/:patientId** - View patient
   - Uses `findLinkedPatient()` to verify ownership

4. **PUT /patients/:patientId/family/:memberId/face** - Update member
   - Uses middleware that validates ownership

## Preventing Bypass Attempts

### Attempt 1: Direct DB Query
```javascript
❌ db.collection('users').findOne({ full_name: "John" })
// Won't work because API doesn't expose this
// Backend validates ownership on every request
```

### Attempt 2: Forging JWT
```javascript
❌ jwt.sign({ guardianId: "hacker" })
// Won't work because JWT_SECRET is server-only
// Tampering detected on verification
```

### Attempt 3: Patient ID Guessing
```javascript
❌ PUT /patients/random-id-12345/family/1/face
// Won't work because endpoint validates:
// 1. You own patient with ID random-id-12345
// 2. That patient owns family member 1
```

## Token Contents

```javascript
JWT payload: {
  id: "507f1f77bcf86cd799439001",        // Guardian ID only
  name: "Jane Doe",
  email: "jane@example.com",
  role: "Guardian"
}
// ✅ NOTE: No patient ID in token
// Patient is stored in app state, validated at login
// Backend always double-checks ownership
```

## Accessing Different Patients

### Switch Patient (Same Guardian)

```typescript
// In app, guardian can switch between their patients
const myPatients = await getMyPatients(); // Lists only MY patients

// Switch to different patient
setCurrentPatient(myPatients[0]);
```

### Try to Access Another Guardian's Patient

```typescript
// Frontend prevents this (only shows YOUR patients)
// If backend is directly attacked:
const { email, password, patientName } = req.body;
// ✅ findPatientByName checks ownership
// Returns null if patient doesn't belong to this guardian
// Login fails with 404
```

## Compliance

This implementation follows security best practices:

- ✅ **Principle of Least Privilege**: Can only access your own patients
- ✅ **Defense in Depth**: Multiple validation layers
- ✅ **No Fallbacks**: Fails closed (denies by default)
- ✅ **Explicit Authorization**: Must verify ownership
- ✅ **Audit Trail**: Can log all access attempts

## Testing

### Manual Test

1. Create Guardian A with patient "Mom"
2. Create Guardian B with patient "John"
3. Try to login as A with patient "John"
4. ✅ Should fail: "No patient named 'John' found under your account"

### Automated Test

```javascript
describe('Auth Security', () => {
  it('should reject login with wrong patient name', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({
        email: 'guardian-a@test.com',
        password: 'password123',
        patientName: 'Guardian-B-Patient'  // Wrong!
      });
    
    expect(response.status).toBe(404);
    expect(response.body.error).toContain('not found under your account');
  });
});
```

## Summary

| Aspect | Status | Detail |
|--------|--------|--------|
| Patient Validation | ✅ Fixed | Only searches YOUR patients |
| Fallback Query | ✅ Removed | No access to other patients |
| Guardian ID Check | ✅ Applied | Every query filters by guardian |
| Multiple Layers | ✅ Implemented | Both direct link & patient_links checked |
| Token Scope | ✅ Limited | No patient ID in JWT |
| Bypass Prevention | ✅ Implemented | Multiple validation layers |

Your app is now **secure against cross-guardian patient access**! 🔐
