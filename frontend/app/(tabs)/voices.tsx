import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Alert, ActivityIndicator, TextInput, Modal, Animated, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import { familyAPI, BASE_URL } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

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

export default function VoicesScreen() {
  const { currentPatient } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingFor, setRecordingFor] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const durationRef = useRef<NodeJS.Timeout | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  useFocusEffect(useCallback(() => {
    loadMembers();
    return () => {
      stopRecordingCleanup();
      stopPlayback();
    };
  }, [currentPatient?.id]));

  const loadMembers = async () => {
    if (!currentPatient) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await familyAPI.list(currentPatient.id);
      setMembers(res.data);
    } finally {
      setLoading(false);
    }
  };

  const stopRecordingCleanup = () => {
    if (durationRef.current) clearInterval(durationRef.current);
  };

  const startPulse = () => {
    pulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulseRef.current.start();
  };

  const stopPulse = () => {
    pulseRef.current?.stop();
    pulseAnim.setValue(1);
  };

  const startRecording = async (memberId: number) => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission required', 'Microphone permission is needed.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(WAV_RECORDING_OPTIONS);
      setRecording(rec);
      setRecordingFor(memberId);
      setRecordingDuration(0);
      startPulse();
      durationRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
    } catch (err) {
      Alert.alert('Error', 'Failed to start recording.');
    }
  };

  const stopRecording = async (memberId: number) => {
    if (!recording) return;
    stopPulse();
    if (durationRef.current) clearInterval(durationRef.current);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setRecordingFor(null);
      if (!uri || !currentPatient) return;
      setUploading(memberId);
      const formData = new FormData();
      formData.append('voice', { uri, name: 'voice.wav', type: 'audio/wav' } as any);
      await familyAPI.uploadVoice(currentPatient.id, memberId, formData);
      loadMembers();
    } catch (err) {
      Alert.alert('Error', 'Failed to save voice recording.');
    }
    setUploading(null);
  };

  const stopPlayback = async () => {
    if (sound) { await sound.unloadAsync(); setSound(null); }
    setPlayingId(null);
  };

  const deleteVoice = (member: Member) => {
    if (!currentPatient || !member.voice_path) return;

    Alert.alert('Delete recording', `Remove the recorded voice for ${member.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (playingId === member.id) {
            await stopPlayback();
          }

          setDeletingId(member.id);
          try {
            await familyAPI.deleteVoice(currentPatient.id, member.id);
            await loadMembers();
          } catch {
            Alert.alert('Error', 'Failed to delete voice recording.');
          }
          setDeletingId(null);
        },
      },
    ]);
  };

  const playVoice = async (member: Member) => {
    if (!member.voice_path) { Alert.alert('No recording', 'No voice recording for this person.'); return; }
    if (playingId === member.id) { await stopPlayback(); return; }
    await stopPlayback();
    try {
      const { sound: s } = await Audio.Sound.createAsync(
        { uri: `${BASE_URL}${member.voice_path}` },
        { shouldPlay: true }
      );
      setSound(s);
      setPlayingId(member.id);
      s.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded || status.didJustFinish) {
          setPlayingId(null);
          setSound(null);
        }
      });
    } catch {
      Alert.alert('Playback Error', 'Could not play the recording.');
    }
  };

  const isRecordingFor = (id: number) => recordingFor === id && recording !== null;

  const formatDuration = (sec: number) => `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#00838F', '#26C6DA']} style={styles.topBar}>
        <Text style={styles.topTitle}>Voice Recordings</Text>
        <Text style={styles.topSub}>Record family voices so your patient can identify them</Text>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color="#00838F" style={{ marginTop: 40 }} />
      ) : members.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="mic-circle-outline" size={64} color="#80DEEA" />
          <Text style={styles.emptyTitle}>No family members added</Text>
          <Text style={styles.emptyText}>Go to the Faces tab to add family members first.</Text>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => {
            const isCurrentlyRecording = isRecordingFor(item.id);
            const isPlaying = playingId === item.id;
            const isUploadingThis = uploading === item.id;

            return (
              <View style={styles.memberCard}>
                <View style={styles.memberLeft}>
                  {item.face_photo_path ? (
                    <Image source={{ uri: `${BASE_URL}${item.face_photo_path}` }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Ionicons name="person" size={22} color="#00838F" />
                    </View>
                  )}
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{item.name}</Text>
                    <View style={styles.relBadge}>
                      <Text style={styles.relText}>{item.relationship}</Text>
                    </View>
                    {item.voice_path ? (
                      <View style={styles.voiceStatusRow}>
                        <Ionicons name="mic" size={13} color="#43A047" />
                        <Text style={styles.voiceStatus}>Voice recorded</Text>
                      </View>
                    ) : (
                      <View style={styles.voiceStatusRow}>
                        <Ionicons name="mic-off" size={13} color="#9E9E9E" />
                        <Text style={[styles.voiceStatus, { color: '#9E9E9E' }]}>No recording</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.memberActions}>
                  {/* Playback button */}
                  {item.voice_path && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: isPlaying ? '#00838F' : '#E0F7FA' }]}
                      onPress={() => playVoice(item)}
                      disabled={isUploadingThis || deletingId === item.id}
                    >
                      <Ionicons name={isPlaying ? 'stop' : 'play'} size={18} color={isPlaying ? '#fff' : '#00838F'} />
                    </TouchableOpacity>
                  )}

                  {item.voice_path && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#FFEBEE' }]}
                      onPress={() => deleteVoice(item)}
                      disabled={isUploadingThis || deletingId === item.id}
                    >
                      {deletingId === item.id ? (
                        <ActivityIndicator size="small" color="#E53935" />
                      ) : (
                        <Ionicons name="trash-outline" size={18} color="#E53935" />
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Record button */}
                  <TouchableOpacity
                    style={[styles.actionBtn, isCurrentlyRecording ? styles.recordingBtn : styles.recordBtn]}
                    onPress={() => isCurrentlyRecording ? stopRecording(item.id) : startRecording(item.id)}
                    disabled={isUploadingThis || deletingId === item.id}
                  >
                    {isUploadingThis ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : isCurrentlyRecording ? (
                      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <Ionicons name="stop" size={18} color="#fff" />
                      </Animated.View>
                    ) : (
                      <Ionicons name="mic" size={18} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>

                {isCurrentlyRecording && (
                  <View style={styles.recordingIndicator}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingTime}>{formatDuration(recordingDuration)}</Text>
                    <Text style={styles.recordingHint}>Tap stop when done</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  topBar: { paddingTop: 20, paddingBottom: 24, paddingHorizontal: 20 },
  topTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  topSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#424242', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#757575', textAlign: 'center', marginTop: 8 },
  memberCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  memberLeft: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar: { width: 52, height: 52, borderRadius: 26, marginRight: 12 },
  avatarPlaceholder: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#E0F7FA', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: '700', color: '#212121' },
  relBadge: { backgroundColor: '#E0F7FA', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start', marginTop: 3 },
  relText: { fontSize: 11, color: '#00838F', fontWeight: '600' },
  voiceStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  voiceStatus: { fontSize: 12, color: '#43A047', fontWeight: '500' },
  memberActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  actionBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  recordBtn: { backgroundColor: '#00838F' },
  recordingBtn: { backgroundColor: '#E53935' },
  recordingIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF3E0', borderRadius: 10, padding: 10, marginTop: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53935' },
  recordingTime: { fontSize: 14, fontWeight: '700', color: '#E53935' },
  recordingHint: { fontSize: 12, color: '#FF8F00' },
});
