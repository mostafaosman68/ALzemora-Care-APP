import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authAPI, BASE_URL } from '../services/api';
import { useAuthStore } from '../store/authStore';

interface Patient {
  id: number;
  name: string;
  age?: number;
  photo_path?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PatientSwitcher({ visible, onClose }: Props) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const { currentPatient, setCurrentPatient } = useAuthStore();

  useEffect(() => {
    if (visible) loadPatients();
  }, [visible]);

  const loadPatients = async () => {
    setLoading(true);
    try {
      const res = await authAPI.myPatients();
      setPatients(res.data);
    } catch {}
    setLoading(false);
  };

  const selectPatient = (patient: Patient) => {
    setCurrentPatient(patient as any);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Switch Patient</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#1E88E5" style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={patients}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.patientItem, currentPatient?.id === item.id && styles.selected]}
                  onPress={() => selectPatient(item)}
                >
                  {item.photo_path ? (
                    <Image source={{ uri: `${BASE_URL}${item.photo_path}` }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Ionicons name="person" size={22} color="#fff" />
                    </View>
                  )}
                  <View style={styles.patientInfo}>
                    <Text style={styles.patientName}>{item.name}</Text>
                    {item.age && <Text style={styles.patientAge}>Age {item.age}</Text>}
                  </View>
                  {currentPatient?.id === item.id && (
                    <Ionicons name="checkmark-circle" size={22} color="#1E88E5" />
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#212121' },
  patientItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8, backgroundColor: '#F5F7FA' },
  selected: { backgroundColor: '#E3F2FD', borderWidth: 1.5, borderColor: '#1E88E5' },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1E88E5', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  patientInfo: { flex: 1 },
  patientName: { fontSize: 16, fontWeight: '600', color: '#212121' },
  patientAge: { fontSize: 13, color: '#757575', marginTop: 2 },
});
