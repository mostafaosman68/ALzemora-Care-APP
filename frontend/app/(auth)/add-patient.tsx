import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { patientAPI } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female'];

export default function AddPatientScreen() {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [diagnosisDate, setDiagnosisDate] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setCurrentPatient } = useAuthStore();

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Patient name is required.'); return; }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      if (age) formData.append('age', age);
      if (gender) formData.append('gender', gender);
      if (bloodType) formData.append('blood_type', bloodType);
      if (diagnosisDate) formData.append('diagnosis_date', diagnosisDate);
      if (emergencyContact) formData.append('emergency_contact', emergencyContact);
      if (notes) formData.append('notes', notes);
      if (photo) {
        const filename = photo.split('/').pop()!;
        formData.append('photo', { uri: photo, name: filename, type: 'image/jpeg' } as any);
      }
      const res = await patientAPI.create(formData);
      await setCurrentPatient(res.data);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to create patient.');
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <LinearGradient colors={['#1565C0', '#1E88E5']} style={styles.topBar}>
        <Text style={styles.topTitle}>Add Patient</Text>
        <Text style={styles.topSub}>Enter your patient's information</Text>
      </LinearGradient>

      <View style={styles.card}>
        {/* Photo */}
        <TouchableOpacity style={styles.photoPicker} onPress={pickPhoto}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera" size={32} color="#1E88E5" />
              <Text style={styles.photoText}>Add Photo</Text>
            </View>
          )}
        </TouchableOpacity>

        <Field label="Full Name *" icon="person-outline" value={name} onChangeText={setName} placeholder="Patient's full name" />
        <Field label="Age" icon="calendar-outline" value={age} onChangeText={setAge} placeholder="e.g. 72" keyboardType="numeric" />

        <Text style={styles.label}>Gender</Text>
        <View style={styles.chipRow}>
          {GENDERS.map(g => (
            <TouchableOpacity key={g} style={[styles.chip, gender === g && styles.chipActive]} onPress={() => setGender(g)}>
              <Text style={[styles.chipText, gender === g && styles.chipTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Blood Type</Text>
        <View style={styles.chipRow}>
          {BLOOD_TYPES.map(bt => (
            <TouchableOpacity key={bt} style={[styles.chip, bloodType === bt && styles.chipActive]} onPress={() => setBloodType(bt)}>
              <Text style={[styles.chipText, bloodType === bt && styles.chipTextActive]}>{bt}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="Diagnosis Date" icon="calendar-outline" value={diagnosisDate} onChangeText={setDiagnosisDate} placeholder="YYYY-MM-DD" />
        <Field label="Emergency Contact" icon="call-outline" value={emergencyContact} onChangeText={setEmergencyContact} placeholder="+1 234 567 8900" keyboardType="phone-pad" />
        <Field label="Medical Notes" icon="document-text-outline" value={notes} onChangeText={setNotes} placeholder="Any relevant medical information..." multiline />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Patient</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Field({ label, icon, value, onChangeText, placeholder, keyboardType, multiline }: any) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, multiline && { height: 90, alignItems: 'flex-start', paddingTop: 12 }]}>
        <Ionicons name={icon} size={20} color="#757575" style={{ marginRight: 10, marginTop: multiline ? 2 : 0 }} />
        <TextInput
          style={[styles.input, multiline && { height: 70, textAlignVertical: 'top' }]}
          placeholder={placeholder}
          placeholderTextColor="#BDBDBD"
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType || 'default'}
          multiline={multiline}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { paddingBottom: 40 },
  topBar: { paddingTop: 60, paddingBottom: 24, paddingHorizontal: 24 },
  topTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },
  topSub: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 24, margin: 16, padding: 24, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  photoPicker: { alignSelf: 'center', marginBottom: 20 },
  photoPreview: { width: 100, height: 100, borderRadius: 50 },
  photoPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#1E88E5', borderStyle: 'dashed' },
  photoText: { fontSize: 12, color: '#1E88E5', marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FAFAFA' },
  input: { flex: 1, fontSize: 15, color: '#212121' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  chipActive: { backgroundColor: '#1E88E5', borderColor: '#1E88E5' },
  chipText: { fontSize: 13, color: '#424242', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#1E88E5', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
