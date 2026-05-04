import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

function getDevHostUrl() {
  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoClient?.hostUri || Constants.manifest?.hostUri;
  if (!hostUri) return null;

  const host = hostUri.replace(/^.*?:\/\//, '').split(':')[0].split('/')[0];
  if (!host) return null;

  return `http://${host}:3000`;
}

const DEFAULT_BASE_URL = Platform.select({
  android: getDevHostUrl() || 'http://10.0.2.2:3000',
  ios: getDevHostUrl() || 'http://localhost:3000',
  web: getDevHostUrl() || 'http://localhost:3000',
  default: getDevHostUrl() || 'http://localhost:3000',
});

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || DEFAULT_BASE_URL || 'http://localhost:3000';

const api = axios.create({ baseURL: `${BASE_URL}/api` });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auth
export const authAPI = {
  register: (data: { name: string; email: string; password: string; role: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string; patientName: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  myPatients: () => api.get('/auth/my-patients'),
};

// Patients
export const patientAPI = {
  list: () => api.get('/patients'),
  create: (formData: FormData) => api.post('/patients', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  get: (id: number) => api.get(`/patients/${id}`),
  update: (id: number, formData: FormData) => api.put(`/patients/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete: (id: number) => api.delete(`/patients/${id}`),
};

// Heartbeat
export const heartbeatAPI = {
  add: (patientId: number, bpm: number, meta?: { source?: string; device_name?: string | null }) =>
    api.post(`/patients/${patientId}/heartbeat`, { bpm, ...meta }),
  history: (patientId: number) => api.get(`/patients/${patientId}/heartbeat`),
  latest: (patientId: number) => api.get(`/patients/${patientId}/heartbeat/latest`),
};

// Family
export const familyAPI = {
  list: (patientId: number) => api.get(`/patients/${patientId}/family`),
  sync: (patientId: number) => api.post(`/patients/${patientId}/family/sync`),
  create: (patientId: number, formData: FormData) =>
    api.post(`/patients/${patientId}/family`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateFace: (patientId: number, memberId: number, formData: FormData) =>
    api.put(`/patients/${patientId}/family/${memberId}/face`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadVoice: (patientId: number, memberId: number, formData: FormData) =>
    api.put(`/patients/${patientId}/family/${memberId}/voice`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteVoice: (patientId: number, memberId: number) =>
    api.delete(`/patients/${patientId}/family/${memberId}/voice`),
  update: (patientId: number, memberId: number, data: { name: string; relationship: string }) =>
    api.put(`/patients/${patientId}/family/${memberId}`, data),
  delete: (patientId: number, memberId: number) =>
    api.delete(`/patients/${patientId}/family/${memberId}`),
  recognize: (patientId: number, formData: FormData) =>
    api.post(`/patients/${patientId}/family/recognize`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// Medications
export const medicationAPI = {
  list: (patientId: number) => api.get(`/patients/${patientId}/medications`),
  today: (patientId: number) => api.get(`/patients/${patientId}/medications/today`),
  create: (patientId: number, formData: FormData) =>
    api.post(`/patients/${patientId}/medications`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (patientId: number, medId: number, formData: FormData) =>
    api.put(`/patients/${patientId}/medications/${medId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete: (patientId: number, medId: number) =>
    api.delete(`/patients/${patientId}/medications/${medId}`),
  log: (patientId: number, medId: number, scheduleId: number, status: string) =>
    api.post(`/patients/${patientId}/medications/${medId}/schedules/${scheduleId}/log`, { status }),
};

export default api;
