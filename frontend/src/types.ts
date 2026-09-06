export interface Run { id: string; date: string; name: string; distanceKm: number; durationSec: number; avgHr?: number | null; elevationM?: number | null; race?: boolean }
export interface Wellness { date: string; sleepScore?: number | null; sleepHours?: number | null; hrvMs?: number | null; hrvBaselineLow?: number | null; hrvBaselineHigh?: number | null }
export interface Snapshot { runs: Run[]; wellness: Wellness[]; syncedAt?: string; warnings?: string[] }
export interface Settings { raceName: string; raceDate: string; goalMinutes: number; days: number; weeklyKm: number; longestKm: number; recentRaceKm: number; recentRaceMinutes: number }
export interface Session { date: string; kind: 'Rest' | 'Easy' | 'Steady' | 'Long run' | 'Race'; km: number; note: string }
export interface Week { start: string; phase: string; km: number; sessions: Session[] }
