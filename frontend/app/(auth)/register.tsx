import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { authAPI } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

export default function RegisterScreen() {
  const [role, setRole] = useState<'Guardian' | 'Caregiver'>('Guardian');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Missing Info', 'Please fill in all fields.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await authAPI.register({ name: name.trim(), email: email.trim(), password, role });
      await setAuth(res.data.token, res.data.guardian, null as any);
      router.replace('/(auth)/add-patient');
    } catch (err: any) {
      Alert.alert('Registration Failed', err.response?.data?.error || 'Could not connect to server.');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={['#1565C0', '#1E88E5', '#42A5F5']} style={styles.gradient}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Register to start managing your patient</Text>
          </View>

          <View style={styles.card}>
            {/* Role selector */}
            <View style={styles.roleToggle}>
              <TouchableOpacity
                style={[styles.roleBtn, role === 'Guardian' && styles.roleBtnActive]}
                onPress={() => setRole('Guardian')}
              >
                <Ionicons name="shield-checkmark-outline" size={16} color={role === 'Guardian' ? '#fff' : '#1E88E5'} style={{ marginRight: 6 }} />
                <Text style={[styles.roleBtnText, role === 'Guardian' && styles.roleBtnTextActive]}>Guardian</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleBtn, role === 'Caregiver' && styles.roleBtnActive]}
                onPress={() => setRole('Caregiver')}
              >
                <Ionicons name="medical-outline" size={16} color={role === 'Caregiver' ? '#fff' : '#1E88E5'} style={{ marginRight: 6 }} />
                <Text style={[styles.roleBtnText, role === 'Caregiver' && styles.roleBtnTextActive]}>Caregiver</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.roleHint}>Registering as: <Text style={styles.roleHintBold}>{role}</Text></Text>

            {[
              { label: 'Full Name', icon: 'person-outline', value: name, setter: setName, placeholder: 'Your full name' },
              { label: 'Email Address', icon: 'mail-outline', value: email, setter: setEmail, placeholder: 'your@email.com', keyboard: 'email-address' as any, autoCapitalize: 'none' as any },
              { label: 'Password', icon: 'lock-closed-outline', value: password, setter: setPassword, placeholder: '••••••••', secure: true },
              { label: 'Confirm Password', icon: 'lock-closed-outline', value: confirm, setter: setConfirm, placeholder: '••••••••', secure: true },
            ].map((field) => (
              <View key={field.label} style={styles.inputGroup}>
                <Text style={styles.label}>{field.label}</Text>
                <View style={styles.inputRow}>
                  <Ionicons name={field.icon as any} size={20} color="#757575" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={field.placeholder}
                    placeholderTextColor="#BDBDBD"
                    value={field.value}
                    onChangeText={field.setter}
                    secureTextEntry={field.secure}
                    keyboardType={field.keyboard || 'default'}
                    autoCapitalize={field.autoCapitalize || 'words'}
                  />
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Account</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginLink} onPress={() => router.back()}>
              <Text style={styles.loginLinkText}>Already have an account? <Text style={styles.bold}>Sign In</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 60 },
  back: { marginBottom: 16 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 6 },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 28, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 8 },
  roleToggle: { flexDirection: 'row', backgroundColor: '#EEF4FF', borderRadius: 12, padding: 4, marginBottom: 12 },
  roleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  roleBtnActive: { backgroundColor: '#1E88E5', shadowColor: '#1E88E5', shadowOpacity: 0.3, shadowRadius: 6, elevation: 3 },
  roleBtnText: { fontSize: 14, fontWeight: '600', color: '#1E88E5' },
  roleBtnTextActive: { color: '#fff' },
  roleHint: { fontSize: 13, color: '#757575', marginBottom: 20, textAlign: 'center' },
  roleHintBold: { fontWeight: '700', color: '#1E88E5' },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FAFAFA' },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: '#212121' },
  btn: { backgroundColor: '#1E88E5', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginLink: { alignItems: 'center', marginTop: 20 },
  loginLinkText: { color: '#757575', fontSize: 14 },
  bold: { color: '#1E88E5', fontWeight: '700' },
});
