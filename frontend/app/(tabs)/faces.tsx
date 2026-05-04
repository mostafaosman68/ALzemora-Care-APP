import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Alert, ActivityIndicator, TextInput, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import { familyAPI, BASE_URL } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import CameraModal from '../../components/CameraModal';

const RELATIONSHIPS = ['Son', 'Daughter', 'Spouse', 'Sibling', 'Parent', 'Grandchild', 'Friend', 'Caregiver', 'Other'];

const WAV_RECORDING_OPTIONS = {
  android: {
    extension: '.wav',
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/wav',
    bitsPerSecond: 128000,
  },
};

interface Member {
  id: number;
  name: string;
  relationship: string;
  face_photo_path?: string;
  voice_path?: string;
}

export default function FacesScreen() {
  const { currentPatient } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [recognizeModal, setRecognizeModal] = useState(false);
  const [recognizeResult, setRecognizeResult] = useState<any>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newRelationship, setNewRelationship] = useState('Other');
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [newVoice, setNewVoice] = useState<string | null>(null);
  const [voiceRecording, setVoiceRecording] = useState<Audio.Recording | null>(null);
  const [saving, setSaving] = useState(false);

  // Camera state
  const [cameraVisible, setCameraVisible] = useState(false);
  const [cameraFor, setCameraFor] = useState<'new' | 'member' | 'recognize'>('new');
  const [pendingMemberId, setPendingMemberId] = useState<number | null>(null);

  useFocusEffect(useCallback(() => {
    if (currentPatient?.id) {
      loadMembers();
    }
  }, [currentPatient?.id]));

  const loadMembers = async () => {
    if (!currentPatient) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await familyAPI.list(currentPatient.id);
      setMembers(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('[Faces] Failed to load family members:', err);
      setError(err.response?.data?.error || 'Failed to load family members.');
    } finally {
      setLoading(false);
    }
  };

  const pickPhoto = async (source: 'camera' | 'gallery') => {
    if (source === 'camera') {
      setCameraFor('new');
      setCameraVisible(true);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setNewPhoto(result.assets[0].uri);
  };

  const startVoiceRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Microphone permission is needed to record voice.');
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(WAV_RECORDING_OPTIONS);
      setVoiceRecording(recording);
      setNewVoice(null);
    } catch {
      Alert.alert('Error', 'Failed to start voice recording.');
    }
  };

  const stopVoiceRecording = async () => {
    if (!voiceRecording) return;

    try {
      await voiceRecording.stopAndUnloadAsync();
      const uri = voiceRecording.getURI();
      setNewVoice(uri ?? null);
    } catch {
      Alert.alert('Error', 'Failed to stop voice recording.');
    } finally {
      setVoiceRecording(null);
    }
  };

  const resetNewMemberForm = async () => {
    if (voiceRecording) {
      try {
        await voiceRecording.stopAndUnloadAsync();
      } catch {}
    }

    setVoiceRecording(null);
    setNewVoice(null);
    setNewPhoto(null);
    setNewName('');
    setNewRelationship('Other');
  };

  const handleRecognize = () => {
    setCameraFor('recognize');
    setCameraVisible(true);
  };

  const pickPhotoForMember = async (memberId: number) => {
    Alert.alert('Choose Source', 'Take a photo or select from gallery?', [
      {
        text: 'Camera',
        onPress: () => {
          setCameraFor('member');
          setPendingMemberId(memberId);
          setCameraVisible(true);
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && currentPatient) {
            setSavingId(memberId);
            try {
              const uri = result.assets[0].uri;
              const formData = new FormData();
              formData.append('face_photo', { uri, name: 'face.jpg', type: 'image/jpeg' } as any);
              await familyAPI.updateFace(currentPatient.id, memberId, formData);
              loadMembers();
            } catch {}
            setSavingId(null);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleCameraCapture = async (uri: string) => {
    try {
      if (cameraFor === 'new') {
        setNewPhoto(uri);
      } else if (cameraFor === 'member' && pendingMemberId && currentPatient) {
        setSavingId(pendingMemberId);
        const formData = new FormData();
        formData.append('face_photo', { uri, name: 'face.jpg', type: 'image/jpeg' } as any);
        await familyAPI.updateFace(currentPatient.id, pendingMemberId, formData);
        loadMembers();
        setSavingId(null);
        setPendingMemberId(null);
      } else if (cameraFor === 'recognize') {
        await handleRecognizeWithPhoto(uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to process photo');
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
    } catch (error) {
      setRecognizeResult(null);
      Alert.alert('Error', 'Recognition failed');
    }
    setRecognizing(false);
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newRelationship) {
      Alert.alert('Required', 'Name and relationship are required.');
      return;
    }
    if (voiceRecording) {
      Alert.alert('Recording in progress', 'Stop the voice recording before saving.');
      return;
    }
    if (!currentPatient) {
      Alert.alert('Error', 'No patient selected.');
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('name', newName.trim());
      formData.append('relationship', newRelationship);
      if (newPhoto) formData.append('face_photo', { uri: newPhoto, name: 'face.jpg', type: 'image/jpeg' } as any);
      if (newVoice) formData.append('voice', { uri: newVoice, name: 'voice.wav', type: 'audio/wav' } as any);

      await familyAPI.create(currentPatient.id, formData);

      setModalVisible(false);
      await resetNewMemberForm();
      loadMembers();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to add member.');
    }
    setSaving(false);
  };

  const handleDelete = (member: Member) => {
    Alert.alert('Delete', `Remove ${member.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await familyAPI.delete(currentPatient!.id, member.id); loadMembers(); } catch {}
        }
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#7B1FA2', '#AB47BC']} style={styles.topBar}>
        <Text style={styles.topTitle}>Face Recognition</Text>
        <Text style={styles.topSub}>Add family & friends so your patient can recognise them</Text>
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.topBtn} onPress={handleRecognize}>
            <Ionicons name="scan" size={16} color="#7B1FA2" />
            <Text style={styles.topBtnText}>Recognize Face</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.topBtn, { backgroundColor: '#fff' }]} onPress={() => setModalVisible(true)}>
            <Ionicons name="person-add" size={16} color="#7B1FA2" />
            <Text style={styles.topBtnText}>Add Person</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color="#7B1FA2" style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.empty}>
          <Ionicons name="warning-outline" size={64} color="#E53935" />
          <Text style={styles.emptyTitle}>Could not load family</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.addFirstBtn} onPress={loadMembers}>
            <Text style={styles.addFirstBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : members.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={64} color="#CE93D8" />
          <Text style={styles.emptyTitle}>No faces added yet</Text>
          <Text style={styles.emptyText}>Add family members and friends so your patient can recognise them.</Text>
          <TouchableOpacity style={styles.addFirstBtn} onPress={() => setModalVisible(true)}>
            <Text style={styles.addFirstBtnText}>Add First Person</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={{ padding: 16 }}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <View style={styles.memberCard}>
              <TouchableOpacity onPress={() => pickPhotoForMember(item.id)}>
                {item.face_photo_path ? (
                  <Image source={{ uri: `${BASE_URL}${item.face_photo_path}` }} style={styles.memberPhoto} />
                ) : (
                  <View style={styles.memberPhotoPlaceholder}>
                    <Ionicons name="camera" size={28} color="#AB47BC" />
                    <Text style={styles.addPhotoText}>Add Face</Text>
                  </View>
                )}
                {savingId === item.id && (
                  <View style={StyleSheet.absoluteFillObject}>
                    <ActivityIndicator color="#7B1FA2" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.memberName}>{item.name}</Text>
              <View style={styles.relBadge}>
                <Text style={styles.relText}>{item.relationship}</Text>
              </View>
              <View style={styles.memberActions}>
                <TouchableOpacity onPress={() => pickPhotoForMember(item.id)}>
                  <Ionicons name="camera-outline" size={18} color="#7B1FA2" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item)}>
                  <Ionicons name="trash-outline" size={18} color="#E53935" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Add Member Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Person</Text>
              <TouchableOpacity onPress={async () => { setModalVisible(false); await resetNewMemberForm(); }}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.photoPicker} onPress={() => Alert.alert('Choose Source', 'Take a photo or select from gallery?', [
              { text: 'Camera', onPress: () => pickPhoto('camera') },
              { text: 'Gallery', onPress: () => pickPhoto('gallery') },
              { text: 'Cancel', style: 'cancel' },
            ])}>
              {newPhoto ? (
                <Image source={{ uri: newPhoto }} style={styles.photoPreview} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera" size={32} color="#7B1FA2" />
                  <Text style={styles.photoText}>Add Face Photo</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.voiceBtn, voiceRecording && styles.voiceBtnActive]}
              onPress={voiceRecording ? stopVoiceRecording : startVoiceRecording}
            >
              <Ionicons name={voiceRecording ? 'stop' : 'mic'} size={18} color={voiceRecording ? '#fff' : '#00838F'} />
              <Text style={[styles.voiceBtnText, voiceRecording && { color: '#fff' }]}>
                {voiceRecording ? 'Stop Voice Recording' : newVoice ? 'Re-record Voice' : 'Record Voice'}
              </Text>
            </TouchableOpacity>

            {newVoice && !voiceRecording && (
              <Text style={styles.voiceReadyText}>Voice recording saved and ready to upload.</Text>
            )}

            <TextInput style={styles.modalInput} placeholder="Full name" placeholderTextColor="#BDBDBD" value={newName} onChangeText={setNewName} />

            <Text style={styles.relLabel}>Relationship</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {RELATIONSHIPS.map(r => (
                  <TouchableOpacity key={r} style={[styles.relChip, newRelationship === r && styles.relChipActive]} onPress={() => setNewRelationship(r)}>
                    <Text style={[styles.relChipText, newRelationship === r && styles.relChipTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Person</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Recognition Result Modal */}
      <Modal visible={recognizeModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { alignItems: 'center', paddingVertical: 32 }]}>
            {recognizing ? (
              <>
                <ActivityIndicator size="large" color="#7B1FA2" />
                <Text style={{ marginTop: 16, color: '#757575' }}>Analyzing face...</Text>
              </>
            ) : recognizeResult?.recognized ? (
              <>
                <Ionicons name="checkmark-circle" size={60} color="#4CAF50" style={{ marginBottom: 12 }} />
                {recognizeResult.member?.face_photo_path ? (
                  <Image source={{ uri: `${BASE_URL}${recognizeResult.member.face_photo_path}` }} style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 12 }} />
                ) : (
                  <View style={[styles.memberPhotoPlaceholder, { width: 80, height: 80, borderRadius: 40 }]}>
                    <Ionicons name="person" size={32} color="#AB47BC" />
                  </View>
                )}
                <Text style={styles.recName}>{recognizeResult.member.name}</Text>
                <Text style={styles.recRel}>{recognizeResult.member.relationship}</Text>
                <Text style={styles.recConf}>Match: {(recognizeResult.confidence * 100).toFixed(1)}%</Text>
              </>
            ) : (
              <>
                <Ionicons name="help-circle" size={60} color="#FF9800" style={{ marginBottom: 12 }} />
                <Text style={styles.recName}>Unknown</Text>
                <Text style={styles.recRel}>Face not registered</Text>
                <Text style={styles.recConf}>Confidence: {(recognizeResult?.confidence * 100).toFixed(1)}%</Text>
              </>
            )}
            <TouchableOpacity style={[styles.saveBtn, { marginTop: 20, width: '100%' }]} onPress={() => { setRecognizeModal(false); setRecognizeResult(null); }}>
              <Text style={styles.saveBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CameraModal 
        visible={cameraVisible}
        onClose={() => setCameraVisible(false)}
        onCapture={handleCameraCapture}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  topBar: { paddingTop: 20, paddingBottom: 20, paddingHorizontal: 20 },
  topTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  topSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4, marginBottom: 14 },
  topActions: { flexDirection: 'row', gap: 10 },
  topBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10 },
  topBtnText: { color: '#7B1FA2', fontWeight: '700', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#424242', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#757575', textAlign: 'center', marginTop: 8 },
  addFirstBtn: { backgroundColor: '#7B1FA2', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 20 },
  addFirstBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  memberCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center', marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  memberPhoto: { width: 90, height: 90, borderRadius: 45, marginBottom: 10 },
  memberPhotoPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#F3E5F5', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#CE93D8', borderStyle: 'dashed', marginBottom: 10 },
  addPhotoText: { fontSize: 11, color: '#AB47BC', marginTop: 4 },
  memberName: { fontSize: 14, fontWeight: '700', color: '#212121', textAlign: 'center' },
  relBadge: { backgroundColor: '#F3E5F5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginTop: 4 },
  relText: { fontSize: 11, color: '#7B1FA2', fontWeight: '600' },
  memberActions: { flexDirection: 'row', gap: 16, marginTop: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#212121' },
  photoPicker: { alignSelf: 'center', marginBottom: 16 },
  photoPreview: { width: 90, height: 90, borderRadius: 45 },
  photoPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#F3E5F5', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#CE93D8', borderStyle: 'dashed' },
  photoText: { fontSize: 11, color: '#7B1FA2', marginTop: 4 },
  voiceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E0F7FA', borderRadius: 12, paddingVertical: 12, marginBottom: 14 },
  voiceBtnActive: { backgroundColor: '#E53935' },
  voiceBtnText: { fontSize: 13, color: '#00838F', fontWeight: '700' },
  voiceReadyText: { fontSize: 12, color: '#43A047', marginBottom: 14, textAlign: 'center' },
  modalInput: { borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12, padding: 14, fontSize: 15, color: '#212121', backgroundColor: '#FAFAFA', marginBottom: 16 },
  relLabel: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 8 },
  relChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  relChipActive: { backgroundColor: '#7B1FA2', borderColor: '#7B1FA2' },
  relChipText: { fontSize: 13, color: '#424242', fontWeight: '500' },
  relChipTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#7B1FA2', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  recName: { fontSize: 20, fontWeight: '800', color: '#212121', marginTop: 8 },
  recRel: { fontSize: 14, color: '#757575', marginTop: 4 },
  recConf: { fontSize: 13, color: '#43A047', marginTop: 4, fontWeight: '600' },
});
