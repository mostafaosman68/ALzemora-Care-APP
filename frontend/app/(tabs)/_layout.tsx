import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useState } from 'react';
import PatientSwitcher from '../../components/PatientSwitcher';
import { useAuthStore } from '../../store/authStore';

function TabBarIcon({ name, color, size }: { name: any; color: string; size: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}

function TabHeader() {
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const { currentPatient, guardian, logout } = useAuthStore();

  return (
    <View style={headerStyles.container}>
      <View>
        <Text style={headerStyles.guardianLabel}>Guardian: <Text style={headerStyles.guardianName}>{guardian?.name}</Text></Text>
        <TouchableOpacity style={headerStyles.patientRow} onPress={() => setSwitcherVisible(true)}>
          <Ionicons name="person-circle-outline" size={18} color="#1E88E5" />
          <Text style={headerStyles.patientName}>{currentPatient?.name}</Text>
          <Ionicons name="chevron-down" size={14} color="#1E88E5" />
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={logout} style={headerStyles.logoutBtn}>
        <Ionicons name="log-out-outline" size={22} color="#E53935" />
      </TouchableOpacity>
      <PatientSwitcher visible={switcherVisible} onClose={() => setSwitcherVisible(false)} />
    </View>
  );
}

const headerStyles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  guardianLabel: { fontSize: 12, color: '#757575' },
  guardianName: { color: '#212121', fontWeight: '600' },
  patientRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  patientName: { fontSize: 16, fontWeight: '700', color: '#1E88E5' },
  logoutBtn: { padding: 8 },
});

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        header: () => <TabHeader />,
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#F0F0F0', height: 60, paddingBottom: 8 },
        tabBarActiveTintColor: '#1E88E5',
        tabBarInactiveTintColor: '#9E9E9E',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <TabBarIcon name="home" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <TabBarIcon name="person" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="heartbeat"
        options={{ title: 'Heartbeat', tabBarIcon: ({ color, size }) => <TabBarIcon name="heart" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="faces"
        options={{ title: 'Faces', tabBarIcon: ({ color, size }) => <TabBarIcon name="people" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="voices"
        options={{ title: 'Voices', tabBarIcon: ({ color, size }) => <TabBarIcon name="mic" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="medications"
        options={{ title: 'Medications', tabBarIcon: ({ color, size }) => <TabBarIcon name="medkit" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
