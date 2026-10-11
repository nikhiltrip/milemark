export interface Run {
  id: string;
  date: string;
  name: string;
  distanceKm: number;
  durationSec: number;
  avgHr?: number | null;
  elevationM?: number | null;
  cadenceSpm?: number | null;
  maxHr?: number | null;
  avgPowerW?: number | null;
  aerobicEffect?: number | null;
  anaerobicEffect?: number | null;
  vo2Max?: number | null;
  groundContactMs?: number | null;
  race?: boolean;
}
export interface Wellness {
  date: string;
  sleepScore?: number | null;
  sleepHours?: number | null;
  hrvMs?: number | null;
  hrv7DayMs?: number | null;
  hrvBaselineLow?: number | null;
  hrvBaselineHigh?: number | null;
  restingHr?: number | null;
}
export interface Snapshot {
  runs: Run[];
  wellness: Wellness[];
  syncedAt?: string;
  warnings?: string[];
  performance?: {
    vo2Max?: number | null;
    vo2Date?: string | null;
    trainingReadiness?: number | null;
    readinessDate?: string | null;
    racePredictions?: {
      date?: string | null;
      fiveKSec?: number | null;
      tenKSec?: number | null;
      halfSec?: number | null;
      marathonSec?: number | null;
    };
  };
}
export interface Settings {
  startDate?: string;
  raceName: string;
  raceDate: string;
  goalMinutes: number;
  days: number;
  weeklyKm: number;
  peakWeeklyKm?: number;
  longestKm: number;
  recentRaceKm: number;
  recentRaceMinutes: number;
}
export interface Session {
  date: string;
  kind: "Rest" | "Easy" | "Steady" | "Long run" | "Race";
  km: number;
  note: string;
}
export interface Week {
  start: string;
  phase: string;
  km: number;
  sessions: Session[];
}
