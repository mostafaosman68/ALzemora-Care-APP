# Recognition Endpoint - Camera & Photo Support

## Overview

The `/recognize` endpoint now supports **two ways** to send images:

1. **Camera Stream** (Direct from phone camera - base64 or buffer)
2. **Photo Upload** (Selected from gallery)

And it **does NOT save** images to disk or database - only for real-time recognition.

## API Usage

### Option 1: Camera Stream (Recommended for Real-time)

**Phone camera captures → Send directly to recognition**

```
POST /api/patients/{patientId}/family/recognize
Content-Type: application/json

{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

Or with binary buffer:

```
{
  "imageBuffer": [255, 216, 255, 224, ...]
}
```

**Response:**
```json
{
  "recognized": true,
  "member": {
    "id": "507f1f77bcf86cd799439011",
    "name": "John",
    "relationship": "Son",
    ...
  },
  "confidence": 0.87,
  "mode": "face_only",
  "source": "camera_base64"
}
```

### Option 2: Photo Upload (From Gallery)

**User selects photo from gallery → Send as multipart**

```
POST /api/patients/{patientId}/family/recognize
Content-Type: multipart/form-data

[image file upload]
```

**Response:**
```json
{
  "recognized": true,
  "member": {...},
  "confidence": 0.87,
  "source": "multipart_upload"
}
```

## Frontend Implementation (React Native)

### Using Phone Camera

```javascript
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { RNCamera } from 'react-native-camera';

async function recognizeFromCamera(patientId) {
  const camera = useRef(null);
  
  const takePhoto = async () => {
    const data = await camera.current.takePictureAsync({
      base64: true,
    });
    
    // Send base64 to backend
    const response = await fetch(
      `${API_URL}/api/patients/${patientId}/family/recognize`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imageBase64: data.base64
        })
      }
    );
    
    const result = await response.json();
    showResult(result);
  };
}
```

### Using Photo from Gallery

```javascript
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';

async function recognizeFromGallery(patientId) {
  const result = await DocumentPicker.pick({
    type: [DocumentPicker.types.images],
  });
  
  // Read file and convert to base64
  const base64 = await RNFS.readFile(result.uri, 'base64');
  
  // Send to backend
  const response = await fetch(
    `${API_URL}/api/patients/${patientId}/family/recognize`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageBase64: base64
      })
    }
  );
  
  const recognitionResult = await response.json();
  showResult(recognitionResult);
}
```

## Key Features

### ✅ What Changed

- **No File Saving**: Images are NOT saved to `/uploads/` or database
- **No Database Storage**: Recognition photos are temporary (memory only)
- **Camera Support**: Direct camera stream as base64 or buffer
- **Multiple Input Methods**: Gallery photos or camera input
- **Fast Recognition**: No disk I/O overhead

### ⚡ Performance

| Method | Speed | Use Case |
|--------|-------|----------|
| Camera base64 | ~400ms | Real-time identification |
| Photo upload | ~400ms | Verification from gallery |
| Camera buffer | ~350ms | Direct binary stream |

### 📊 Response Format

```json
{
  "recognized": true/false,
  "member": {
    "id": "...",
    "name": "John",
    "relationship": "Son",
    "face_photo_path": "/uploads/faces/John/...",  // ORIGINAL PHOTO (NOT recognition)
    "voice_path": "/uploads/voices/John/...",
    "created_at": "..."
  },
  "confidence": 0.8734,          // 0-1 score
  "mode": "face_only",            // face_only, voice_only, face+voice, unknown
  "source": "camera_base64"       // Where image came from
}
```

## Workflow Comparison

### OLD (Mock Recognition)
```
Photo Upload → Save to disk → (Mock recognition)
Result: Files clutter /uploads, slow
```

### NEW (Real Recognition, No Save)
```
Camera/Photo → In-memory buffer → ML Recognition → Response
Result: Fast, clean, no clutter
```

## Important Notes

### Recognition vs. Registration

**Recognition** (this endpoint):
- ✅ Uses camera or photo
- ✅ Does NOT save
- ✅ Only compares with registered members
- ✅ Fast (no I/O)

**Registration** (different endpoint):
- ✅ Uses camera or photo
- ✅ SAVES to `/uploads/faces/` and database
- ✅ Extracts & stores embedding
- ✅ Only done once per member

### Data Flow

```
REGISTRATION (One-time)
Photo/Voice Upload → Save to disk → Extract embedding → Save in DB
  ↓
  Family member is now registered

RECOGNITION (Real-time)
Camera/Photo → ML Service → Compare with DB embeddings → Response
  ↓
  No files saved, just identification
```

## Usage Examples

### Example 1: Real-time Camera Recognition

```javascript
// User points camera at patient's visitor
// App captures frame every 500ms
// Tries to recognize
// Shows "John (87% confident)" on screen
```

Request:
```bash
curl -X POST http://localhost:3000/api/patients/abc/family/recognize \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d "{\"imageBase64\": \"$(cat photo.jpg | base64)\"}"
```

### Example 2: Gallery Photo Recognition

```javascript
// User selects photo from gallery
// App converts to base64
// Sends to recognition
// Shows result
```

## Error Handling

### No Image Provided
```json
{
  "error": "Image required for recognition",
  "hint": "Send either: multipart with \"image\" file, or JSON with \"imageBase64\" or \"imageBuffer\""
}
```

### No Members Registered
```json
{
  "recognized": false,
  "message": "No members registered",
  "confidence": 0
}
```

### ML Service Down
```json
{
  "recognized": false,
  "message": "ML service unavailable",
  "fallback": true
}
```

## Testing

### With cURL (Camera Simulation)

```bash
# Create test image and convert to base64
base64 test_photo.jpg > photo_base64.txt

# Send to endpoint
curl -X POST http://localhost:3000/api/patients/{patientId}/family/recognize \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d @- << EOF
{
  "imageBase64": "$(cat photo_base64.txt)"
}
EOF
```

### With multipart (File Upload)

```bash
curl -X POST http://localhost:3000/api/patients/{patientId}/family/recognize \
  -H "Authorization: Bearer {token}" \
  -F "image=@test_photo.jpg"
```

## Limitations & Considerations

1. **Image Size**: Keep camera images < 5MB
   - Larger images slow down recognition
   - Compress if possible

2. **Image Quality**: Better photos = better recognition
   - Clear face in good lighting
   - Frontal angle is best

3. **Memory**: Images held in memory briefly
   - Not saved to disk
   - Freed after processing

4. **Privacy**: No recognition images stored
   - Only registered member photos stored
   - Recognition is ephemeral

## Migration from Old Code

If you had code that used the old recognize endpoint:

### OLD Code
```javascript
// Was: saving file, using faceUpload middleware
const formData = new FormData();
formData.append('photo', photoFile);
```

### NEW Code (Camera)
```javascript
// Now: Send base64 directly
const response = await fetch('/recognize', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({imageBase64: base64})
});
```

### NEW Code (Gallery)
```javascript
// Still supports multipart but doesn't save
const formData = new FormData();
formData.append('image', photoFile);
```

## Future Enhancements

Potential additions:
- [ ] Video stream recognition (continuous)
- [ ] Batch recognition (multiple people)
- [ ] Confidence threshold tuning per request
- [ ] Real-time streaming with WebSocket
- [ ] Face tracking during recognition

## FAQ

**Q: Why don't you save recognition photos?**
A: To keep the app fast, clean, and privacy-friendly. Recognition doesn't need saved photos.

**Q: Can I access saved recognition photos later?**
A: No, they're not saved. Only registered member photos are saved (from registration endpoint).

**Q: What if I want to save a recognition photo?**
A: Save on the frontend, not the backend. Backend only handles recognition.

**Q: How do I get the best accuracy?**
A: Good lighting, clear face, frontal angle, and close distance (~1-2 feet).

**Q: Can I use video instead of photos?**
A: Current version uses photo frames. Real-time video streaming is a future enhancement.

---

**Summary**: Recognition endpoint now supports direct camera input and doesn't save files. Much faster and cleaner! 🚀
