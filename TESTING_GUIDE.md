# 🧪 Testing Guide - Camera & Security

## Prerequisites

- Real device (not simulator)
- Backend running: `cd backend && npm start`
- Frontend running: `cd frontend && npm start`
- Expo Go app on phone

## Test Suite 1: Camera Functionality

### Test 1.1: Camera Opens
**What to test**: Camera initializes correctly

```
Steps:
1. Tap "Add Person" button
2. Tap the camera placeholder
3. Choose "Camera"

Expected: Camera view opens with purple header
```

### Test 1.2: Camera Permissions
**What to test**: Permission dialog appears and works

```
Steps:
1. If first time, app asks for camera permission
2. Tap "Grant Permission"

Expected: Camera view appears after granting
```

### Test 1.3: Take Photo (Front Camera)
**What to test**: Capture photo with front camera

```
Steps:
1. Camera is open (default front camera)
2. Center your face in view
3. Tap the white capture button
4. Wait for focus

Expected: Photo captured, modal closes, preview shows in dialog
```

### Test 1.4: Switch Camera Direction
**What to test**: Switch between front and back cameras

```
Steps:
1. Camera is open
2. Tap the flip icon (top right, curved arrow)

Expected: Camera switches to back camera
           Tap flip again switches back to front
```

### Test 1.5: Close Camera
**What to test**: Can close camera without taking photo

```
Steps:
1. Camera is open
2. Tap X button (top left)

Expected: Camera closes, dialog visible again without photo
```

## Test Suite 2: Photo Picker Alternative

### Test 2.1: Gallery Option
**What to test**: Gallery picker still works as fallback

```
Steps:
1. Tap "Add Person"
2. Tap camera placeholder
3. Choose "Gallery"

Expected: Image picker opens, can select photo
           Photo appears in preview
```

### Test 2.2: Add Member with Photo
**What to test**: Complete flow from photo to saved member

```
Steps:
1. Add member with camera photo
2. Enter name: "Test Person"
3. Select relationship: "Caregiver"
4. Tap "Save Person"

Expected: Member appears in grid with photo
           Can see relationship badge
```

## Test Suite 3: Recognition

### Test 3.1: Recognize Registered Face
**What to test**: Face recognition works with saved member

```
Prerequisites:
- At least one family member added with clear face photo

Steps:
1. Tap "Recognize Face" button
2. Camera opens
3. Hold face steady in view (same person as member)
4. Tap white capture button

Expected: Modal shows:
          ✅ Green checkmark
          ✓ Member name
          ✓ Relationship
          ✓ Confidence % (should be >80%)
```

### Test 3.2: Unknown Face
**What to test**: Unknown person returns "Unknown"

```
Prerequisites:
- Family member added

Steps:
1. Tap "Recognize Face"
2. Show different person's face (not in database)
3. Capture photo

Expected: Modal shows:
          ? Help icon
          "Unknown"
          "Face not registered"
          Low confidence %
```

### Test 3.3: Recognition Speed
**What to test**: Recognition completes in reasonable time

```
Steps:
1. Start timer
2. Tap "Recognize Face"
3. Capture photo
4. Wait for result
5. Stop timer

Expected: Result appears within 3-5 seconds
          (Most time is ML service processing)
```

## Test Suite 4: Member Photo Updates

### Test 4.1: Update with Camera
**What to test**: Can update member photo using camera

```
Prerequisites:
- At least one member exists

Steps:
1. Tap member card
2. Tap camera icon (curved arrow)
3. Choose "Camera"
4. Take new photo
5. Wait for upload

Expected: Member photo updates with new image
```

### Test 4.2: Update with Gallery
**What to test**: Gallery option for member update

```
Prerequisites:
- At least one member exists

Steps:
1. Tap member card
2. Tap camera icon
3. Choose "Gallery"
4. Select new photo

Expected: Member photo updates
```

## Test Suite 5: Security - Patient Validation

### Test 5.1: Login with Correct Patient
**What to test**: Can login with correct patient name

```
Setup:
1. Create Guardian A account
2. Add patient "Mom" to Guardian A
3. Log out

Test:
1. Login with:
   - Guardian A email
   - Guardian A password
   - Patient name: "Mom"

Expected: ✅ Login succeeds
          Shows "Mom" as current patient
```

### Test 5.2: Login with Wrong Patient Name
**What to test**: Cannot login with different patient name

```
Setup:
1. Guardian A has patient "Mom"
2. Guardian B has patient "Dad"

Test:
1. Try to login as Guardian A with:
   - Guardian A email
   - Guardian A password
   - Patient name: "Dad" (belongs to B)

Expected: ❌ Login fails
          Error: "No patient named 'Dad' found under your account"
```

### Test 5.3: Login with Non-existent Patient
**What to test**: Cannot login if patient doesn't exist

```
Setup:
1. Guardian A has patient "Mom"

Test:
1. Try to login as Guardian A with:
   - Guardian A email
   - Guardian A password
   - Patient name: "Random Name"

Expected: ❌ Login fails
          Error: "No patient named 'Random Name' found under your account"
```

### Test 5.4: Switch Between Patients
**What to test**: Can only switch to your own patients

```
Setup:
1. Guardian A has patients: "Mom", "Dad"

Test:
1. Login with "Mom"
2. View "My Patients" list
3. Try to switch to "Dad"

Expected: ✅ Switch succeeds
          Both are Guardian A's patients
```

## Test Suite 6: No Photo Saving

### Test 6.1: Photos Not in Storage
**What to test**: Photos aren't saved to phone storage

```
Steps:
1. Add member with camera photo
2. Recognize a face with camera
3. Update member photo with camera
4. Open phone file explorer / Photos app
5. Check recent photos

Expected: ❌ NO new photos appear in phone storage
          (App uses embeddings only, not files)
```

### Test 6.2: Backend Logs (Optional)
**What to test**: Backend doesn't save photos

```
Steps:
1. Start backend with: npm start
2. Watch console output
3. Use camera features
4. Check for file operations

Expected: ❌ No "Saving photo" logs
          ❌ No file paths created
          ✅ "Embedding extracted" appears
```

## Test Suite 7: Edge Cases

### Test 7.1: Take Photo, Don't Save Member
**What to test**: Can cancel after capturing photo

```
Steps:
1. Tap "Add Person"
2. Take camera photo
3. Photo appears in preview
4. Tap X to close dialog

Expected: Dialog closes
          Photo NOT saved
          Member NOT created
```

### Test 7.2: Multiple Recognition Attempts
**What to test**: Can recognize multiple times in sequence

```
Steps:
1. Tap "Recognize Face"
2. Capture photo 1
3. Close modal
4. Tap "Recognize Face" again
5. Capture photo 2

Expected: Both recognitions work
          No crashes or hangs
```

### Test 7.3: Same Member, Multiple Photos
**What to test**: Can add multiple members with same person

```
Steps:
1. Add "Person1" with photo
2. Add "Person2" with same person's photo
   (same face, different name)

Expected: Both members can be added
          App handles multiple identities correctly
```

### Test 7.4: Quick Camera On/Off
**What to test**: Camera handles rapid opening/closing

```
Steps:
1. Tap "Recognize Face"
2. Immediately close (X button)
3. Tap "Recognize Face" again
4. Let camera load

Expected: No crashes
          Camera works properly on re-open
```

## Test Suite 8: Permissions

### Test 8.1: Grant Permission First Time
**What to test**: Permission dialog appears correctly

```
Prerequisites:
- Fresh app install (or permissions reset)

Steps:
1. Tap "Recognize Face"
2. Permission dialog appears
3. Tap "Grant Permission"

Expected: Camera opens and works
```

### Test 8.2: Deny Permission
**What to test**: Can deny and ask later

```
Steps:
1. Permission dialog appears
2. Tap "X" or "Deny"
3. Try camera again

Expected: Permission dialog appears again
          Can retry granting
```

### Test 8.3: Revoke Permission (Settings)
**What to test**: App handles revoked permissions

```
Steps:
1. Grant camera permission
2. Go to phone Settings
3. Find app, revoke Camera permission
4. Return to app
5. Try to use camera

Expected: Permission dialog appears
          Can grant again
```

## Performance Benchmarks

### Expected Timings
```
Camera startup:      < 1 second
Photo capture:       < 1 second
Embedding extract:   1-2 seconds
Recognition match:   < 100ms
Member save:         1-2 seconds
Gallery picker:      < 500ms
```

### Test Performance
```
Steps:
1. Use camera features normally
2. Note any delays or hangs
3. Check if embeddings are fast

Expected: All operations complete smoothly
          No hangs or crashes
          Smooth UI responsiveness
```

## Success Criteria

### All Tests Should Pass ✅
- [x] Camera functionality (6 tests)
- [x] Photo picker alternative (2 tests)
- [x] Recognition (3 tests)
- [x] Member updates (2 tests)
- [x] Security validation (4 tests)
- [x] No photo saving (2 tests)
- [x] Edge cases (4 tests)
- [x] Permissions (3 tests)

### Summary: 26 Total Tests

If all pass: ✅ **Ready for production**

## Common Issues & Fixes

| Issue | Test | Fix |
|-------|------|-----|
| Camera won't open | 1.1 | Use real device |
| Permission denied | 5.1 | Grant camera in settings |
| Face not recognized | 3.2 | Better lighting, steady hand |
| Photo still in storage | 6.1 | Check recent photos in phone |
| Recognition slow | 3.3 | Check ML service running |
| Member not saving | 4.2 | Check name/relationship filled |
| Camera stuck | 7.2 | Close app, reopen |
| Wrong patient login | 5.2 | Verify patient_name matches |

## Test Report Template

```
Date: _______
Device: _______ (Model, OS version)
App Version: 1.0.0

Test Results:
✅ 1.1 Camera Opens
✅ 1.2 Permissions
✅ 1.3 Front Camera Photo
✅ 1.4 Camera Switch
...

Issues Found:
- [List any failures]

Recommendations:
- [Any improvements]

Status: ✅ PASS / ❌ FAIL
```

---

**Ready to test?** Start with Test Suite 1: Camera Functionality

Report any issues with the test name and details!
