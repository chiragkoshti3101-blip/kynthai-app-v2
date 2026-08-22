'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Currency } from './currency';
import type { Locale } from './locales';
import { detectLocale } from './locales';

export type AppScreen =
  | 'landing'
  | 'login'
  | 'pricing'
  | 'checkout'
  | 'privacy'
  | 'terms'
  | 'cookies'
  | 'accessibility'
  | 'medical-disclaimer'
  | 'patient'
  | 'doctor'
  | 'lab'
  | 'caretaker'
  | 'family'
  | 'family_member'
  | 'admin'
  | 'refund-cancellation';
export type LoginPortal = 'patient' | 'doctor' | 'lab' | 'caretaker' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'patient' | 'doctor' | 'lab' | 'caretaker' | 'admin';
  phone?: string | null;
  subscriptionTier?: 'free' | 'plus' | 'family_pro';
  /** True for one-tap demo logins. Demo users skip backend verification
   *  (doctor/lab) and get seeded sample data so the dashboards render
   *  immediately without a real DB session. */
  isDemo?: boolean;
  /** US privacy consent flags — always present when user is logged in. */
  consentAccepted?: boolean;
  dataProcessingConsent?: boolean;
  aiTrainingConsent?: boolean;
  /** True if the logged-in user is below the age threshold (minor). */
  isUserMinor?: boolean;
}

interface AppState {
  screen: AppScreen;
  user: AuthUser | null;
  loginPortal: LoginPortal;
  checkoutTier: 'plus' | 'family_pro';
  checkoutFounder: boolean; // Founder's Circle pricing
  onboardingComplete: boolean;
  onboardingRole: 'patient' | 'caretaker' | 'doctor' | 'lab';
  /** User's preferred currency for subscription pricing. Auto-detected on first visit. */
  currency: Currency;
  /** User's preferred language. Auto-detected on first visit. */
  language: Locale;
  doctorOnline: boolean;
  labOnline: boolean;
  /** True while zustand/persist is rehydrating from localStorage. */
  _hydrated: boolean;
  /** In-app alarm ringtone for medication reminders. */
  alarmEnabled: boolean;
  /** Ringtone style: "professional" = gentle chime, "alert" = loud beeps */
  alarmMode: 'professional' | 'alert';
  setScreen: (s: AppScreen) => void;
  setLoginPortal: (p: LoginPortal) => void;
  setCheckoutTier: (t: 'plus' | 'family_pro') => void;
  setCheckoutFounder: (f: boolean) => void;
  setCurrency: (c: Currency) => void;
  setLanguage: (l: Locale) => void;
  setDoctorOnline: (v: boolean) => void;
  setLabOnline: (v: boolean) => void;
  completeOnboarding: (role?: LoginPortal) => void;
  setOnboardingRole: (role: 'patient' | 'caretaker' | 'doctor' | 'lab') => void;
  login: (user: AuthUser) => void;
  logout: () => void;
  setHydrated: (v: boolean) => void;
  toggleAlarm: () => void;
  setAlarmMode: (mode: 'professional' | 'alert') => void;
}

// ─── Selector helpers ──────────────────────────────────────────────────────
// Use these to prevent unnecessary re-renders. Without a selector,
// useAppStore() subscribes to the entire state and re-renders on
// any change anywhere.

export const selectors = {
  screen: (s: AppState) => s.screen,
  user: (s: AppState) => s.user,
  loginPortal: (s: AppState) => s.loginPortal,
  checkoutTier: (s: AppState) => s.checkoutTier,
  checkoutFounder: (s: AppState) => s.checkoutFounder,
  onboardingComplete: (s: AppState) => s.onboardingComplete,
  onboardingRole: (s: AppState) => s.onboardingRole,
  currency: (s: AppState) => s.currency,
  language: (s: AppState) => s.language,
  doctorOnline: (s: AppState) => s.doctorOnline,
  labOnline: (s: AppState) => s.labOnline,
  _hydrated: (s: AppState) => s._hydrated,
  alarmEnabled: (s: AppState) => s.alarmEnabled,
  alarmMode: (s: AppState) => s.alarmMode,
  login: (s: AppState) => s.login,
} as const;

export const useAppStore = create<AppState>()(
  persist(
    set => ({
      screen: 'landing',
      user: null,
      loginPortal: 'caretaker',
      checkoutTier: 'plus',
      checkoutFounder: false,
      onboardingComplete: false,
      onboardingRole: 'patient',
      currency: 'USD',
      language: detectLocale(),
      doctorOnline: true,
      labOnline: true,
      _hydrated: false,
      alarmEnabled: true,
      alarmMode: 'professional',
      setScreen: screen => set({ screen }),
      setLoginPortal: loginPortal => set({ loginPortal }),
      setCheckoutTier: checkoutTier => set({ checkoutTier }),
      setCheckoutFounder: checkoutFounder => set({ checkoutFounder }),
      setCurrency: currency => set({ currency }),
      setLanguage: language => set({ language }),
      setDoctorOnline: doctorOnline => set({ doctorOnline }),
      setLabOnline: labOnline => set({ labOnline }),
      completeOnboarding: (role?: LoginPortal) =>
        set({
          onboardingComplete: true,
          onboardingRole: (role ?? 'patient') as AppState['onboardingRole'],
        }),
      setOnboardingRole: onboardingRole => set({ onboardingRole }),
      login: user =>
        set((s) => ({
          user,
          // Returning users who already accepted consent on the server skip Welcome
          onboardingComplete:
            user.consentAccepted === true ? true : s.onboardingComplete,
          onboardingRole:
            user.consentAccepted === true
              ? (user.role as AppState['onboardingRole'])
              : s.onboardingRole,
          screen:
            user.role === 'patient'
              ? 'patient'
              : user.role === 'doctor'
                ? 'doctor'
                : user.role === 'lab'
                  ? 'lab'
                  : user.role === 'admin'
                    ? 'admin'
                    : 'caretaker',
        })),
      logout: () => set({ user: null, screen: 'login', loginPortal: 'caretaker' }),
      setHydrated: v => set({ _hydrated: v }),
      toggleAlarm: () => set(s => ({ alarmEnabled: !s.alarmEnabled })),
      setAlarmMode: alarmMode => set({ alarmMode }),
    }),
    {
      name: 'kynthai-store-v2',
      partialize: state => ({
        user: state.user,
        screen: state.screen,
        onboardingComplete: state.onboardingComplete,
        onboardingRole: state.onboardingRole,
        currency: state.currency,
        language: state.language,
        doctorOnline: state.doctorOnline,
        labOnline: state.labOnline,
        alarmEnabled: state.alarmEnabled,
        alarmMode: state.alarmMode,
      }),
      version: 5,
      // Merge persisted state with safe defaults — never wipe existing data.
      // Only reset fields that are known to be stale from older versions.
      // v5: stop forcing onboardingComplete=false (v4 forced a one-time re-tour).
      // Preserve completion so returning users never see Welcome again on this device.
      migrate: (state: unknown) => {
        const prev = (state as Partial<AppState>) || {};
        return {
          ...prev,
          screen: (prev.screen ?? 'landing') as AppScreen,
          loginPortal: (prev.loginPortal ?? 'caretaker') as LoginPortal,
          checkoutTier: (prev.checkoutTier ?? 'plus') as 'plus' | 'family_pro',
          onboardingComplete: prev.onboardingComplete === true,
          onboardingRole: (prev.onboardingRole ?? 'patient') as AppState['onboardingRole'],
          currency: (prev.currency ?? 'USD') as Currency,
          language: (prev.language ?? 'en') as Locale,
        } as Partial<AppState>;
      },
      onRehydrateStorage: () => state => {
        if (!state) return;

        // ─── Corrupted localStorage recovery ─────────────────────────────
        // If the persisted data is corrupt (not JSON), clear it and start fresh.
        // Otherwise just mark as hydrated — let the rest of the app handle
        // stale sessions via the AuthGuard component.
        const storedRaw = typeof window !== 'undefined'
          ? window.localStorage?.getItem('kynthai-store-v2')
          : null;
        if (storedRaw && state.user) {
          try {
            const parsed = JSON.parse(storedRaw);
            if (!parsed?.state?.user?.id) {
              // Incomplete stored state — clear it
              window.localStorage?.removeItem('kynthai-store-v2');
              state.setHydrated(true);
              state.logout();
              return;
            }
          } catch {
            // Corrupted JSON — clear it
            window.localStorage?.removeItem('kynthai-store-v2');
            state.setHydrated(true);
            state.logout();
            return;
          }
        }

        state.setHydrated(true);
      },
    }
  )
);
