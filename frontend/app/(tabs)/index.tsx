import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { medicationAPI, heartbeatAPI, BASE_URL } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

interface MedItem {
  medication: { id: number; name: string; dosage: string; photo_path: string };
  schedule: { id: number; time: string };
  log: { status: string; taken_at: string } | null;
}

export default function DashboardScreen() {
  const { guardian, currentPatient } = useAuthStore();
  const [todayMeds, setTodayMeds] = useState<MedItem[]>([]);
  const [latestBpm, setLatestBpm] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    if (!currentPatient) return;
    try {
      const [medsRes, bpmRes] = await Promise.all([
        medicationAPI.today(currentPatient.id),
        heartbeatAPI.latest(currentPatient.id),
      ]);
      setTodayMeds(medsRes.data);
      setLatestBpm(bpmRes.data?.bpm ?? null);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { loadData(); }, [currentPatient?.id]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const markTaken = async (item: MedItem) => {
    if (!currentPatient) return;
    try {
      await medicationAPI.log(currentPatient.id, item.medication.id, item.schedule.id, 'taken');
      loadData();
    } catch {}
  };

  const pending = todayMeds.filter(m => m.log?.status !== 'taken');
  const taken = todayMeds.filter(m => m.log?.status === 'taken');
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1E88E5" /></View>;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E88E5']} />}
    >
      {/* Hero */}
      <LinearGradient colors={['#1E88E5', '#42A5F5']} style={styles.hero}>
        <Text style={styles.greeting}>{greeting},</Text>
        <Text style={styles.guardianName}>{guardian?.name}</Text>
        <View style={styles.patientBadge}>
          <Ionicons name="person-circle" size={18} color="rgba(255,255,255,0.9)" />
          <Text style={styles.patientBadgeText}>Managing: {currentPatient?.name}</Text>
        </View>

        {/* BPM widget */}
        <View style={styles.bpmCard}>
          <View style={styles.bpmLeft}>
            <Ionicons name="heart" size={22} color="#E53935" />
            <Text style={styles.bpmLabel}>Latest BPM</Text>
          </View>
          <Text style={styles.bpmValue}>{latestBpm ?? '--'}</Text>
        </View>
      </LinearGradient>

      {/* Today's Date */}
      <View style={styles.dateRow}>
        <Ionicons name="calendar" size={16} color="#757575" />
        <Text style={styles.dateText}>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
      </View>

      {/* Medication Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today's Medications</Text>
        <View style={styles.statsRow}>
          <StatCard icon="checkmark-circle" color="#43A047" label="Taken" value={taken.length} />
          <StatCard icon="time" color="#FF8F00" label="Pending" value={pending.length} />
          <StatCard icon="list" color="#1E88E5" label="Total" value={todayMeds.length} />
        </View>
      </View>

      {/* Pending Medications */}
      {pending.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pending</Text>
          {pending.map((item, i) => (
            <MedRow key={i} item={item} onTaken={() => markTaken(item)} />
          ))}
        </View>
      )}

      {/* Taken Medications */}
      {taken.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Taken Today</Text>
          {taken.map((item, i) => (
            <MedRow key={i} item={item} done />
          ))}
        </View>
      )}

      {todayMeds.length === 0 && (
        <View style={styles.emptyBox}>
          <Ionicons name="checkmark-done-circle" size={48} color="#43A047" />
          <Text style={styles.emptyText}>No medications scheduled for today</Text>
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function StatCard({ icon, color, label, value }: any) {
  return (
    <View style={[styles.statCard, { borderTopColor: color, borderTopWidth: 3 }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MedRow({ item, onTaken, done }: { item: MedItem; onTaken?: () => void; done?: boolean }) {
  return (
    <View style={[styles.medRow, done && styles.medRowDone]}>
      {item.medication.photo_path ? (
        <Image source={{ uri: `${BASE_URL}${item.medication.photo_path}` }} style={styles.medPhoto} />
      ) : (
        <View style={[styles.medPhotoPlaceholder, done && { backgroundColor: '#E8F5E9' }]}>
          <Ionicons name="medkit" size={20} color={done ? '#43A047' : '#1E88E5'} />
        </View>
      )}
      <View style={styles.medInfo}>
        <Text style={styles.medName}>{item.medication.name}</Text>
        {item.medication.dosage && <Text style={styles.medDosage}>{item.medication.dosage}</Text>}
        <View style={styles.medTimeRow}>
          <Ionicons name="time-outline" size={13} color="#757575" />
          <Text style={styles.medTime}>{item.schedule.time}</Text>
        </View>
      </View>
      {done ? (
        <Ionicons name="checkmark-circle" size={28} color="#43A047" />
      ) : (
        <TouchableOpacity style={styles.takenBtn} onPress={onTaken}>
          <Text style={styles.takenBtnText}>Taken</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  greeting: { fontSize: 16, color: 'rgba(255,255,255,0.85)' },
  guardianName: { fontSize: 26, fontWeight: '800', color: '#fff', marginTop: 2 },
  patientBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start' },
  patientBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  bpmCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 16 },
  bpmLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bpmLabel: { fontSize: 14, color: '#424242', fontWeight: '600' },
  bpmValue: { fontSize: 28, fontWeight: '800', color: '#E53935' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12 },
  dateText: { fontSize: 14, color: '#757575' },
  section: { paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#212121', marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  statValue: { fontSize: 24, fontWeight: '800', color: '#212121', marginTop: 6 },
  statLabel: { fontSize: 12, color: '#757575', marginTop: 2 },
  medRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  medRowDone: { opacity: 0.7 },
  medPhoto: { width: 50, height: 50, borderRadius: 10, marginRight: 12 },
  medPhotoPlaceholder: { width: 50, height: 50, borderRadius: 10, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  medInfo: { flex: 1 },
  medName: { fontSize: 15, fontWeight: '700', color: '#212121' },
  medDosage: { fontSize: 13, color: '#757575', marginTop: 2 },
  medTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  medTime: { fontSize: 12, color: '#757575' },
  takenBtn: { backgroundColor: '#1E88E5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  takenBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  emptyBox: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15, color: '#757575', marginTop: 12, textAlign: 'center' },
});
