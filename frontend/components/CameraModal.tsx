import React, { useRef, useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Modal, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface CameraModalProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (uri: string) => void;
}

export default function CameraModal({ visible, onClose, onCapture }: CameraModalProps) {
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [loading, setLoading] = useState(false);
  const permissionRequested = useRef(false);

  useEffect(() => {
    if (!visible) {
      permissionRequested.current = false;
      return;
    }

    if (!permissionRequested.current && (!permission || !permission.granted)) {
      permissionRequested.current = true;
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  if (!visible) {
    return null;
  }

  // Still loading permissions
  if (permission === null || permission === undefined) {
    return (
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#7B1FA2" />
            <Text style={styles.loadingText}>Initializing camera...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  // Permission denied
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
              Allow camera access to take photos of family members.
            </Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={() => requestPermission()}>
              <Text style={styles.permissionBtnText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.permissionBtn, { backgroundColor: '#ccc' }]} onPress={onClose}>
              <Text style={styles.permissionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const capturePhoto = async () => {
    if (!cameraRef.current) {
      Alert.alert('Error', 'Camera not ready');
      return;
    }
    
    try {
      setLoading(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });
      onCapture(photo.uri);
    } catch (error) {
      Alert.alert('Error', 'Failed to capture photo: ' + (error as any).message);
    } finally {
      setLoading(false);
    }
  };

  // Camera ready - show camera view
  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <LinearGradient colors={['#7B1FA2', '#AB47BC']} style={styles.header}>
          <TouchableOpacity onPress={onClose} disabled={loading}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Take Photo</Text>
          <TouchableOpacity 
            onPress={() => setFacing(facing === 'front' ? 'back' : 'front')}
            disabled={loading}
          >
            <Ionicons name="camera-reverse" size={24} color="#fff" />
          </TouchableOpacity>
        </LinearGradient>

        <CameraView 
          ref={cameraRef} 
          style={styles.camera} 
          facing={facing}
        />

        <View style={styles.controls}>
          {loading ? (
            <ActivityIndicator size="large" color="#7B1FA2" />
          ) : (
            <TouchableOpacity style={styles.captureBtn} onPress={capturePhoto}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>
          )}
          <Text style={styles.hint}>{facing === 'front' ? 'Front Camera' : 'Back Camera'}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 50,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  camera: {
    flex: 1,
  },
  controls: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#000',
  },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtnInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#7B1FA2',
  },
  hint: {
    color: '#fff',
    marginTop: 12,
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#7B1FA2',
    marginTop: 16,
    fontSize: 14,
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  permissionText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  permissionBtn: {
    backgroundColor: '#7B1FA2',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  permissionBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
});
