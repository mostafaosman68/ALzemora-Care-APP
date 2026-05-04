import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, TextInput, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { patientAPI, BASE_URL } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female'];

export default function ProfileScreen() {
  const { currentPatient, setCurrentPatient, guardian } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addingPatient, setAddingPatient] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    age: '',
    gender: '',
    blood_type: '',
    diagnosis_date: '',
    emergency_contact: '',
    notes: '',
  });

  useEffect(() => {
    if (currentPatient) {
      setForm({
        name: currentPatient.name || '',
        age: currentPatient.age?.toString() || '',
        gender: (currentPatient as any).gender || '',
        blood_type: (currentPatient as any).blood_type || '',
        diagnosis_date: (currentPatient as any).diagnosis_date || '',
        emergency_contact: (currentPatient as any).emergency_contact || '',
        notes: (currentPatient as any).notes || '',
      });
    }
  }, [currentPatient]);

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
    if (!currentPatient) return;
    setLoading(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) formData.append(k, v); });
      if (photo) {
        const filename = photo.split('/').pop()!;
        formData.append('photo', { uri: photo, name: filename, type: 'image/jpeg' } as any);
      }
      const res = await patientAPI.update(currentPatient.id, formData);
      await setCurrentPatient(res.data);
      setEditing(false);
      setPhoto(null);
      Alert.alert('Saved', 'Patient profile updated.');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to update.');
    }
    setLoading(false);
  };

  const photoUri = photo || (currentPatient?.photo_path ? `${BASE_URL}${currentPatient.photo_path}` : null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <LinearGradient colors={['#1E88E5', '#42A5F5']} style={styles.hero}>
        <TouchableOpacity style={styles.avatarContainer} onPress={editing ? pickPhoto : undefined}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={44} color="#fff" />
            </View>
          )}
          {editing && (
            <View style={styles.editPhotoOverlay}>
              <Ionicons name="camera" size={18} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
        {!editing ? (
          <>
            <Text style={styles.heroName}>{currentPatient?.name}</Text>
            {(currentPatient as any)?.age && <Text style={styles.heroSub}>Age {(currentPatient as any).age}</Text>}
          </>
        ) : (
          <Text style={styles.heroName}>Editing Profile</Text>
        )}
      </LinearGradient>

      <View style={styles.actionRow}>
        {!editing ? (
          <>
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
              <Ionicons name="pencil" size={16} color="#fff" />
              <Text style={styles.editBtnText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(auth)/add-patient')}>
              <Ionicons name="person-add" size={16} color="#1E88E5" />
              <Text style={styles.addBtnText}>Add Patient</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditing(false); setPhoto(null); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editBtn} onPress={handleSave} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.editBtnText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.card}>
        <InfoSection
          title="Personal Information"
          icon="person-outline"
          fields={[
            { label: 'Full Name', value: form.name, key: 'name', editing },
            { label: 'Age', value: form.age, key: 'age', editing, keyboardType: 'numeric' },
          ]}
          form={form}
          setForm={setForm}
        />

        {/* Gender */}
        {editing ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Gender</Text>
            <View style={styles.chipRow}>
              {GENDERS.map(g => (
                <TouchableOpacity key={g} style={[styles.chip, form.gender === g && styles.chipActive]}
                  onPress={() => setForm({ ...form, gender: g })}>
                  <Text style={[styles.chipText, form.gender === g && styles.chipTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          form.gender ? <InfoField label="Gender" value={form.gender} /> : null
        )}

        {/* Blood Type */}
        {editing ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Blood Type</Text>
            <View style={styles.chipRow}>
              {BLOOD_TYPES.map(bt => (
                <TouchableOpacity key={bt} style={[styles.chip, form.blood_type === bt && styles.chipActive]}
                  onPress={() => setForm({ ...form, blood_type: bt })}>
                  <Text style={[styles.chipText, form.blood_type === bt && styles.chipTextActive]}>{bt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          form.blood_type ? <InfoField label="Blood Type" value={form.blood_type} icon="water" iconColor="#E53935" /> : null
        )}

        <InfoSection
          title="Medical Information"
          icon="medical-outline"
          fields={[
            { label: 'Diagnosis Date', value: form.diagnosis_date, key: 'diagnosis_date', editing, placeholder: 'YYYY-MM-DD' },
            { label: 'Emergency Contact', value: form.emergency_contact, key: 'emergency_contact', editing },
            { label: 'Medical Notes', value: form.notes, key: 'notes', editing, multiline: true },
          ]}
          form={form}
          setForm={setForm}
        />
      </View>
    </ScrollView>
  );
}

function InfoSection({ title, icon, fields, form, setForm }: any) {
  return (
    <View style={styles.infoSection}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={18} color="#1E88E5" />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {fields.map((f: any) => (
        f.editing ? (
          <View key={f.key} style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{f.label}</Text>
            <TextInput
              style={[styles.fieldInput, f.multiline && { height: 80, textAlignVertical: 'top' }]}
              value={f.value}
              onChangeText={v => setForm((prev: any) => ({ ...prev, [f.key]: v }))}
              placeholder={f.placeholder || f.label}
              placeholderTextColor="#BDBDBD"
              keyboardType={f.keyboardType || 'default'}
              multiline={f.multiline}
            />
          </View>
        ) : (
          f.value ? <InfoField key={f.key} label={f.label} value={f.value} /> : null
        )
      ))}
    </View>
  );
}

function InfoField({ label, value, icon, iconColor }: any) {
  return (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  hero: { alignItems: 'center', paddingTop: 24, paddingBottom: 28 },
  avatarContainer: { position: 'relative', marginBottom: 12 },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#fff' },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff' },
  editPhotoOverlay: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#1565C0', borderRadius: 14, padding: 6 },
  heroName: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 10, padding: 16 },
  editBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1E88E5', borderRadius: 12, paddingVertical: 12 },
  editBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  addBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#E3F2FD', borderRadius: 12, paddingVertical: 12 },
  addBtnText: { color: '#1E88E5', fontWeight: '700', fontSize: 14 },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 12, backgroundColor: '#F5F5F5' },
  cancelBtnText: { color: '#757575', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 20, margin: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  infoSection: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#212121' },
  infoField: { marginBottom: 12 },
  infoLabel: { fontSize: 12, color: '#757575', marginBottom: 2 },
  infoValue: { fontSize: 15, color: '#212121', fontWeight: '500' },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, color: '#424242', fontWeight: '600', marginBottom: 6 },
  fieldInput: { borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 10, padding: 12, fontSize: 15, color: '#212121', backgroundColor: '#FAFAFA' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  chipActive: { backgroundColor: '#1E88E5', borderColor: '#1E88E5' },
  chipText: { fontSize: 13, color: '#424242', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
});
