import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { LineChart } from 'react-native-chart-kit';
import { heartbeatAPI } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

const { width } = Dimensions.get('window');

interface Reading { id: number; bpm: number; timestamp: string }

function getBpmStatus(bpm: number) {
  if (bpm < 50) return { label: 'Very Low', color: '#1E88E5', icon: 'arrow-down-circle' };
  if (bpm < 60) return { label: 'Low', color: '#FF8F00', icon: 'arrow-down' };
  if (bpm <= 100) return { label: 'Normal', color: '#43A047', icon: 'checkmark-circle' };
  if (bpm <= 120) return { label: 'Elevated', color: '#FF8F00', icon: 'arrow-up' };
  return { label: 'High', color: '#E53935', icon: 'arrow-up-circle' };
}

export default function HeartbeatScreen() {
  const { currentPatient } = useAuthStore();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [currentBpm, setCurrentBpm] = useState<number | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useFocusEffect(useCallback(() => {
    loadHistory();
    refreshIntervalRef.current = setInterval(() => {
      loadHistory();
    }, 5000);
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [currentPatient?.id]));

  const animatePulse = () => {
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.3, duration: 200, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const loadHistory = async () => {
    if (!currentPatient) return;
    try {
      const [historyRes, latestRes] = await Promise.all([
        heartbeatAPI.history(currentPatient.id),
        heartbeatAPI.latest(currentPatient.id),
      ]);

      setReadings(historyRes.data);
      const latest = latestRes.data ?? historyRes.data[0] ?? null;
      setCurrentBpm(latest?.bpm ?? null);
    } catch {}
  };

  const status = currentBpm ? getBpmStatus(currentBpm) : null;
  const chartReadings = [...readings].reverse().slice(-12);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* BPM Display */}
      <LinearGradient colors={status ? [status.color, status.color + 'CC'] : ['#1E88E5', '#42A5F5']} style={styles.bpmHero}>
        <Animated.View style={[styles.heartContainer, { transform: [{ scale: pulseAnim }] }]}>
          <Ionicons name="heart" size={56} color="#fff" />
        </Animated.View>
        <Text style={styles.bpmValue}>{currentBpm ?? '--'}</Text>
        <Text style={styles.bpmUnit}>BPM</Text>
        {status && (
          <View style={styles.statusBadge}>
            <Ionicons name={status.icon as any} size={16} color="#fff" />
            <Text style={styles.statusText}>{status.label}</Text>
          </View>
        )}
        {readings[0] && (
          <Text style={styles.lastReading}>
            Last recorded: {new Date(readings[0].timestamp).toLocaleTimeString()}
          </Text>
        )}
        {!readings[0] && (
          <Text style={styles.lastReading}>
            Start the external Polar H10 bridge to stream live readings into this screen.
          </Text>
        )}
      </LinearGradient>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="bluetooth" size={20} color="#1E88E5" />
          <Text style={styles.cardTitle}>Polar H10 Bridge Feed</Text>
        </View>
        <Text style={styles.sensorNote}>
          Expo Go cannot talk to BLE directly. Run the external Polar H10 bridge and this screen will update from the backend.
        </Text>
        <TouchableOpacity style={styles.simBtn} onPress={loadHistory}>
          <Ionicons name="refresh" size={20} color="#fff" />
          <Text style={styles.simBtnText}>Refresh Readings</Text>
        </TouchableOpacity>
      </View>

      {/* Chart */}
      {chartReadings.length >= 2 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="stats-chart" size={20} color="#1E88E5" />
            <Text style={styles.cardTitle}>Recent Readings</Text>
          </View>
          <LineChart
            data={{
              labels: chartReadings.map((r, i) => i % 3 === 0 ? new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''),
              datasets: [{ data: chartReadings.map(r => r.bpm), color: () => '#E53935', strokeWidth: 2 }],
            }}
            width={width - 64}
            height={180}
            chartConfig={{
              backgroundColor: '#fff',
              backgroundGradientFrom: '#fff',
              backgroundGradientTo: '#fff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(229, 57, 53, ${opacity})`,
              labelColor: () => '#757575',
              propsForDots: { r: '4', fill: '#E53935' },
            }}
            bezier
            style={{ borderRadius: 12 }}
          />
        </View>
      )}

      {/* History */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="time-outline" size={20} color="#1E88E5" />
          <Text style={styles.cardTitle}>Reading History</Text>
        </View>
        {readings.length === 0 ? (
          <Text style={styles.emptyText}>No readings recorded yet.</Text>
        ) : (
          readings.slice(0, 20).map((r) => {
            const s = getBpmStatus(r.bpm);
            return (
              <View key={r.id} style={styles.historyRow}>
                <View style={[styles.historyDot, { backgroundColor: s.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyBpm}>{r.bpm} BPM</Text>
                  <Text style={styles.historyTime}>{new Date(r.timestamp).toLocaleString()}</Text>
                </View>
                <View style={[styles.historyBadge, { backgroundColor: s.color + '20' }]}>
                  <Text style={[styles.historyBadgeText, { color: s.color }]}>{s.label}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  bpmHero: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  heartContainer: { marginBottom: 8 },
  bpmValue: { fontSize: 72, fontWeight: '900', color: '#fff', lineHeight: 80 },
  bpmUnit: { fontSize: 18, color: 'rgba(255,255,255,0.8)', marginBottom: 10 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  statusText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  lastReading: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: 16, margin: 12, marginBottom: 0, padding: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#212121' },
  sensorNote: { fontSize: 13, color: '#757575', marginBottom: 14, lineHeight: 18 },
  simBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1E88E5', borderRadius: 12, paddingVertical: 14 },
  simBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyText: { color: '#9E9E9E', textAlign: 'center', padding: 20 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  historyDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  historyBpm: { fontSize: 15, fontWeight: '600', color: '#212121' },
  historyTime: { fontSize: 12, color: '#757575', marginTop: 2 },
  historyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  historyBadgeText: { fontSize: 12, fontWeight: '600' },
});
