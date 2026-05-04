import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface Guardian {
  id: number;
  name: string;
  email: string;
  role: 'Guardian' | 'Caregiver';
}

interface Patient {
  id: number;
  name: string;
  age?: number;
  gender?: string;
  diagnosis_date?: string;
  emergency_contact?: string;
  blood_type?: string;
  notes?: string;
  photo_path?: string;
}

interface AuthState {
  token: string | null;
  guardian: Guardian | null;
  currentPatient: Patient | null;
  isLoading: boolean;
  setAuth: (token: string, guardian: Guardian, patient: Patient) => Promise<void>;
  setCurrentPatient: (patient: Patient) => void;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  guardian: null,
  currentPatient: null,
  isLoading: true,

  setAuth: async (token, guardian, patient) => {
    await SecureStore.setItemAsync('auth_token', token);
    await SecureStore.setItemAsync('guardian_data', JSON.stringify(guardian));
    await SecureStore.setItemAsync('current_patient', JSON.stringify(patient));
    set({ token, guardian, currentPatient: patient });
  },

  setCurrentPatient: async (patient) => {
    await SecureStore.setItemAsync('current_patient', JSON.stringify(patient));
    set({ currentPatient: patient });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('guardian_data');
    await SecureStore.deleteItemAsync('current_patient');
    set({ token: null, guardian: null, currentPatient: null });
  },

  loadFromStorage: async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      const guardianStr = await SecureStore.getItemAsync('guardian_data');
      const patientStr = await SecureStore.getItemAsync('current_patient');
      if (token && guardianStr && patientStr) {
        set({
          token,
          guardian: JSON.parse(guardianStr),
          currentPatient: JSON.parse(patientStr),
        });
      }
    } finally {
      set({ isLoading: false });
    }
  },
}));
