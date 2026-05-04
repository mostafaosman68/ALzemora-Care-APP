import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Alert, ActivityIndicator, TextInput, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { medicationAPI, BASE_URL } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

interface Schedule { id: number; time: string }
interface Medication {
  id: number; name: string; dosage: string; notes: string;
  photo_path?: string; schedules: Schedule[];
}

const TIME_PRESETS = ['07:00', '08:00', '12:00', '13:00', '18:00', '20:00', '22:00'];

export default function MedicationsScreen() {
  const { currentPatient } = useAuthStore();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: '', dosage: '', notes: '' });
  const [times, setTimes] = useState<string[]>([]);
  const [customTime, setCustomTime] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);

  useFocusEffect(useCallback(() => { loadMeds(); }, [currentPatient?.id]));

  const loadMeds = async () => {
    if (!currentPatient) return;
    setLoading(true);
    try {
      const res = await medicationAPI.list(currentPatient.id);
      setMedications(res.data);
    } catch {}
    setLoading(false);
  };

  const openModal = (med?: Medication) => {
    if (med) {
      setEditingMed(med);
      setForm({ name: med.name, dosage: med.dosage || '', notes: med.notes || '' });
      setTimes(med.schedules.map(s => s.time));
    } else {
      setEditingMed(null);
      setForm({ name: '', dosage: '', notes: '' });
      setTimes([]);
    }
    setPhoto(null);
    setModalVisible(true);
  };

  const closeModal = () => { setModalVisible(false); setPhoto(null); };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  };

  const toggleTime = (t: string) => {
    setTimes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t].sort());
  };

  const addCustomTime = () => {
    if (!/^\d{2}:\d{2}$/.test(customTime)) { Alert.alert('Invalid', 'Use HH:MM format (e.g. 09:30)'); return; }
    if (!times.includes(customTime)) setTimes(prev => [...prev, customTime].sort());
    setCustomTime('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Medication name is required.'); return; }
    if (times.length === 0) { Alert.alert('Required', 'Add at least one schedule time.'); return; }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('name', form.name.trim());
      if (form.dosage) formData.append('dosage', form.dosage);
      if (form.notes) formData.append('notes', form.notes);
      formData.append('times', JSON.stringify(times));
      if (photo) formData.append('photo', { uri: photo, name: 'med.jpg', type: 'image/jpeg' } as any);

      if (editingMed) {
        await medicationAPI.update(currentPatient!.id, editingMed.id, formData);
      } else {
        await medicationAPI.create(currentPatient!.id, formData);
      }
      closeModal();
      loadMeds();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to save medication.');
    }
    setSaving(false);
  };

  const handleDelete = (med: Medication) => {
    Alert.alert('Delete', `Remove ${med.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await medicationAPI.delete(currentPatient!.id, med.id); loadMeds(); } catch {}
        }
      },
    ]);
  };

  const detectMedication = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled) return;
    Alert.alert('Object Detection', 'Analyzing medication image...\n\n(In production, this would identify the medication using a trained YOLO/TensorFlow model.)');
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#E53935', '#EF5350']} style={styles.topBar}>
        <Text style={styles.topTitle}>Medications</Text>
        <Text style={styles.topSub}>Manage {currentPatient?.name}'s medications and schedules</Text>
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.topBtn} onPress={detectMedication}>
            <Ionicons name="scan-circle-outline" size={16} color="#E53935" />
            <Text style={styles.topBtnText}>Detect Med</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={() => openModal()}>
            <Ionicons name="add-circle-outline" size={16} color="#E53935" />
            <Text style={styles.topBtnText}>Add Medication</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color="#E53935" style={{ marginTop: 40 }} />
      ) : medications.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="medkit-outline" size={64} color="#FFCDD2" />
          <Text style={styles.emptyTitle}>No medications added</Text>
          <Text style={styles.emptyText}>Add medications with their schedules to track them daily.</Text>
          <TouchableOpacity style={styles.addFirstBtn} onPress={() => openModal()}>
            <Text style={styles.addFirstBtnText}>Add First Medication</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={medications}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={styles.medCard}>
              <View style={styles.medCardTop}>
                {item.photo_path ? (
                  <Image source={{ uri: `${BASE_URL}${item.photo_path}` }} style={styles.medPhoto} />
                ) : (
                  <View style={styles.medPhotoPlaceholder}>
                    <Ionicons name="medkit" size={28} color="#E53935" />
                  </View>
                )}
                <View style={styles.medInfo}>
                  <Text style={styles.medName}>{item.name}</Text>
                  {item.dosage && <Text style={styles.medDosage}>{item.dosage}</Text>}
                  {item.notes ? <Text style={styles.medNotes} numberOfLines={2}>{item.notes}</Text> : null}
                </View>
                <View style={styles.medActions}>
                  <TouchableOpacity onPress={() => openModal(item)} style={styles.iconBtn}>
                    <Ionicons name="pencil-outline" size={18} color="#1E88E5" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(item)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color="#E53935" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.schedules}>
                <Text style={styles.schedulesLabel}>
                  <Ionicons name="time-outline" size={13} color="#757575" /> Schedule:
                </Text>
                <View style={styles.timeChips}>
                  {item.schedules.map(s => (
                    <View key={s.id} style={styles.timeChip}>
                      <Text style={styles.timeChipText}>{s.time}</Text>
                    </View>
                  ))}
                  {item.schedules.length === 0 && <Text style={styles.noSchedule}>No times set</Text>}
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Add/Edit Medication Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingMed ? 'Edit Medication' : 'Add Medication'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Photo */}
              <TouchableOpacity style={styles.photoPicker} onPress={pickPhoto}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.photoPreview} />
                ) : editingMed?.photo_path ? (
                  <Image source={{ uri: `${BASE_URL}${editingMed.photo_path}` }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="camera" size={32} color="#E53935" />
                    <Text style={styles.photoText}>Medication Photo</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.inputLabel}>Medication Name *</Text>
              <TextInput style={styles.input} placeholder="e.g. Donepezil" placeholderTextColor="#BDBDBD" value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} />

              <Text style={styles.inputLabel}>Dosage</Text>
              <TextInput style={styles.input} placeholder="e.g. 10mg" placeholderTextColor="#BDBDBD" value={form.dosage} onChangeText={v => setForm(f => ({ ...f, dosage: v }))} />

              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} placeholder="Special instructions..." placeholderTextColor="#BDBDBD" value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} multiline />

              <Text style={styles.inputLabel}>Schedule Times *</Text>
              <View style={styles.presetRow}>
                {TIME_PRESETS.map(t => (
                  <TouchableOpacity key={t} style={[styles.presetChip, times.includes(t) && styles.presetChipActive]} onPress={() => toggleTime(t)}>
                    <Text style={[styles.presetChipText, times.includes(t) && styles.presetChipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.customTimeRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="HH:MM"
                  placeholderTextColor="#BDBDBD"
                  value={customTime}
                  onChangeText={setCustomTime}
                  maxLength={5}
                />
                <TouchableOpacity style={styles.addTimeBtn} onPress={addCustomTime}>
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              {times.length > 0 && (
                <View style={styles.selectedTimes}>
                  {times.map(t => (
                    <TouchableOpacity key={t} style={styles.selectedTimeChip} onPress={() => toggleTime(t)}>
                      <Text style={styles.selectedTimeText}>{t}</Text>
                      <Ionicons name="close-circle" size={14} color="#E53935" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{editingMed ? 'Save Changes' : 'Add Medication'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  topBtnText: { color: '#E53935', fontWeight: '700', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#424242', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#757575', textAlign: 'center', marginTop: 8 },
  addFirstBtn: { backgroundColor: '#E53935', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 20 },
  addFirstBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  medCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  medCardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  medPhoto: { width: 60, height: 60, borderRadius: 12, marginRight: 12 },
  medPhotoPlaceholder: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#FFEBEE', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  medInfo: { flex: 1 },
  medName: { fontSize: 16, fontWeight: '700', color: '#212121' },
  medDosage: { fontSize: 13, color: '#E53935', fontWeight: '600', marginTop: 2 },
  medNotes: { fontSize: 12, color: '#757575', marginTop: 4 },
  medActions: { gap: 4 },
  iconBtn: { padding: 6 },
  schedules: { borderTopWidth: 1, borderTopColor: '#F5F5F5', paddingTop: 10 },
  schedulesLabel: { fontSize: 12, color: '#757575', marginBottom: 8 },
  timeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeChip: { backgroundColor: '#FFEBEE', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  timeChipText: { fontSize: 13, color: '#E53935', fontWeight: '600' },
  noSchedule: { fontSize: 12, color: '#9E9E9E' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#212121' },
  photoPicker: { alignSelf: 'center', marginBottom: 16 },
  photoPreview: { width: 120, height: 90, borderRadius: 12 },
  photoPlaceholder: { width: 120, height: 90, borderRadius: 12, backgroundColor: '#FFEBEE', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#EF9A9A', borderStyle: 'dashed' },
  photoText: { fontSize: 12, color: '#E53935', marginTop: 4 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12, padding: 12, fontSize: 15, color: '#212121', backgroundColor: '#FAFAFA', marginBottom: 14 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  presetChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  presetChipActive: { backgroundColor: '#E53935', borderColor: '#E53935' },
  presetChipText: { fontSize: 13, color: '#424242', fontWeight: '500' },
  presetChipTextActive: { color: '#fff' },
  customTimeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  addTimeBtn: { backgroundColor: '#E53935', borderRadius: 12, width: 48, justifyContent: 'center', alignItems: 'center' },
  selectedTimes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  selectedTimeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFEBEE', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  selectedTimeText: { fontSize: 13, color: '#E53935', fontWeight: '600' },
  saveBtn: { backgroundColor: '#E53935', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4, marginBottom: 8 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
