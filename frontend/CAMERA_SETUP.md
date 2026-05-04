# 📱 Adding Camera Support to React Native App

## Current Issue

The app currently only supports selecting photos from the gallery. To add camera support, you need to:

1. Install camera package
2. Add camera permissions
3. Update components to offer camera option

## Step 1: Install Camera Package

```bash
cd frontend
npx expo install expo-camera
```

This adds the `expo-camera` package for native camera access.

## Step 2: Add Camera Permissions

Edit `frontend/app.json` and add camera permissions:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "Allow $(PRODUCT_NAME) to access your camera",
          "microphonePermission": "Allow $(PRODUCT_NAME) to access your microphone"
        }
      ]
    ]
  }
}
```

## Step 3: Create Camera Component

Create `frontend/components/CameraModal.tsx`:

```typescript
import React, { useRef, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Modal, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface CameraModalProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (uri: string) => void;
}

export default function CameraModal({ visible, onClose, onCapture }: CameraModalProps) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('front');

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.container}>
          <LinearGradient colors={['#7B1FA2', '#AB47BC']} style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.title}>Camera Access</Text>
            <View style={{ width: 24 }} />
          </LinearGradient>

          <View style={styles.permissionContainer}>
            <Ionicons name="camera" size={64} color="#AB47BC" />
            <Text style={styles.permissionTitle}>Camera Access Required</Text>
            <Text style={styles.permissionText}>
              Allow camera access to take photos of family members for recognition.
            </Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const capturePhoto = async () => {
    try {
      if (cameraRef.current) {
        const photo = await (cameraRef.current as any).takePictureAsync({
          quality: 0.8,
          base64: false,
        });
        onCapture(photo.uri);
        onClose();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to capture photo');
    }
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <LinearGradient colors={['#7B1FA2', '#AB47BC']} style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Take Photo</Text>
          <TouchableOpacity onPress={() => setFacing(facing === 'front' ? 'back' : 'front')}>
            <Ionicons name="camera-reverse" size={24} color="#fff" />
          </TouchableOpacity>
        </LinearGradient>

        <CameraView ref={cameraRef} style={styles.camera} facing={facing} />

        <View style={styles.controls}>
          <TouchableOpacity style={styles.captureBtn} onPress={capturePhoto}>
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>
          <Text style={styles.hint}>{facing === 'front' ? 'Front Camera' : 'Back Camera'}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    paddingTop: 50,
  },
  title: { fontSize: 18, fontWeight: '600', color: '#fff' },
  camera: { flex: 1 },
  controls: { alignItems: 'center', paddingVertical: 24, backgroundColor: '#000' },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtnInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#7B1FA2' },
  hint: { color: '#fff', marginTop: 12, fontSize: 12 },
  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  permissionTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginTop: 16 },
  permissionText: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  permissionBtn: {
    backgroundColor: '#7B1FA2',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  permissionBtnText: { color: '#fff', fontWeight: '600' },
});
```

## Step 4: Update faces.tsx

Add camera import:

```typescript
import CameraModal from '../../components/CameraModal';
```

Add state for camera modal:

```typescript
const [cameraVisible, setCameraVisible] = useState(false);
const [cameraFor, setCameraFor] = useState<'new' | 'member' | 'recognize'>('new');
const [pendingMemberId, setPendingMemberId] = useState<number | null>(null);
```

Create helper functions for camera:

```typescript
const handleCameraCapture = (uri: string) => {
  if (cameraFor === 'new') {
    setNewPhoto(uri);
  } else if (cameraFor === 'member' && pendingMemberId) {
    pickPhotoForMember(pendingMemberId); // Already have URI
  } else if (cameraFor === 'recognize') {
    handleRecognizeWithPhoto(uri);
  }
  setCameraVisible(false);
};

const handleRecognizeWithPhoto = async (photoUri: string) => {
  if (!currentPatient) return;
  setRecognizing(true);
  setRecognizeModal(true);
  try {
    const formData = new FormData();
    formData.append('photo', { uri: photoUri, name: 'recognize.jpg', type: 'image/jpeg' } as any);
    const res = await familyAPI.recognize(currentPatient.id, formData);
    setRecognizeResult(res.data);
  } catch {
    setRecognizeResult(null);
  }
  setRecognizing(false);
};
```

Update photo picker buttons:

```typescript
// In "Add Person" button
<TouchableOpacity style={styles.photoPicker} onPress={() => { setCameraFor('new'); setCameraVisible(true); }}>
  {newPhoto ? (
    <Image source={{ uri: newPhoto }} style={styles.photoPreview} />
  ) : (
    <View style={styles.photoPlaceholder}>
      <Ionicons name="camera" size={32} color="#7B1FA2" />
      <Text style={styles.photoText}>Take a Photo</Text>
    </View>
  )}
</TouchableOpacity>

// For member photo update
<TouchableOpacity 
  onPress={() => { 
    setCameraFor('member'); 
    setPendingMemberId(item.id); 
    setCameraVisible(true); 
  }}
>
  {/* ... */}
</TouchableOpacity>

// For recognition
const handleRecognize = () => {
  // Option 1: Camera
  setCameraFor('recognize');
  setCameraVisible(true);
  
  // Or Option 2: Gallery (keep old behavior as fallback)
  // ... existing code
};
```

Add camera modal to render:

```typescript
<CameraModal 
  visible={cameraVisible} 
  onClose={() => setCameraVisible(false)} 
  onCapture={handleCameraCapture}
/>
```

## Step 5: Update API to Accept Both Input Methods

The backend `/recognize` endpoint already supports both:
- Multipart with `image` file (gallery)
- JSON with `imageBase64` (camera)

So no backend changes needed! ✅

## Complete Example: Updated Photo Picker

```typescript
const pickPhoto = async (source: 'camera' | 'gallery') => {
  if (source === 'camera') {
    setCameraFor('new');
    setCameraVisible(true);
    return;
  }
  
  // Gallery
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (!result.canceled) setNewPhoto(result.assets[0].uri);
};
```

## Permissions Files

### Android (android/app/src/main/AndroidManifest.xml)
Already handled by Expo plugin ✅

### iOS (ios/AlzheimemerCare/Info.plist)
Already handled by Expo plugin ✅

## Testing

1. **Test on Real Device**: Camera won't work in simulator
2. **Grant Permissions**: App will ask for camera access on first use
3. **Front Camera**: Default for face recognition
4. **Back Camera**: Use flip button for alternate angle

## Troubleshooting

### "Camera permission denied"
- Go to app settings → Permissions → Camera → Allow

### "Camera not available"
- Must test on real device, not simulator
- Device must have a camera

### "Photo not saving"
- Check that `handleCameraCapture` is called
- Verify file permissions

## Next Steps

1. Install `expo-camera`: `npx expo install expo-camera`
2. Create `CameraModal.tsx` component
3. Update `faces.tsx` with camera state & handlers
4. Update `app.json` with camera plugin
5. Test on real device

---

**Note**: The backend already supports camera input via base64! You just need the frontend camera component.
