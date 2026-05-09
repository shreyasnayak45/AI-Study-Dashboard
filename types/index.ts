import type { User } from "@supabase/supabase-js";

export type { User };

// ─── Study Tracker ────────────────────────────────────────────────────────────

export interface StudySession {
  id: string;
  user_id: string;
  subject: string;
  duration_minutes: number;
  notes: string | null;
  studied_at: string;   // ISO 8601 timestamptz
  created_at: string;
}

export interface SessionFormData {
  subject: string;
  duration_minutes: number;
  notes: string;
  studied_at: string;   // YYYY-MM-DD
}

export interface TrackerStats {
  todayMinutes: number;
  weekMinutes: number;
  streak: number;
  totalSessions: number;
  recentSessions: StudySession[];
  miniData: DailyStudyData[];  // last 7 days — reused from already-fetched sessions
}

// ─── Task Manager ─────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  completed: boolean;
  priority: "low" | "medium" | "high";
  due_date: string | null;   // DATE type → Supabase returns "YYYY-MM-DD"
  created_at: string;
  updated_at: string;
}

export interface TaskFormData {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  due_date: string;          // "YYYY-MM-DD" or "" (empty = no due date)
}

export interface TaskStats {
  total: number;
  completed: number;
  active: number;
  overdue: number;
  dueToday: number;
  upcomingTasks: Task[];     // incomplete tasks, due soonest first, max 5
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface DailyStudyData {
  date: string;    // "YYYY-MM-DD"
  label: string;   // "May 5"
  minutes: number;
  hours: number;   // decimal e.g. 1.5
}

export interface WeeklyStudyData {
  weekStart: string;  // "YYYY-MM-DD"
  label: string;      // "May 5"
  minutes: number;
  hours: number;
}

export interface SubjectData {
  subject: string;
  minutes: number;
  hours: number;
  percentage: number;
  sessions: number;
}

export interface Insight {
  key: string;
  icon: "flame" | "target" | "trending-up" | "star" | "calendar" | "book-open";
  color: "brand" | "emerald" | "orange" | "violet" | "red";
  title: string;
  description: string;
}

export interface AnalyticsStats {
  totalMinutes: number;
  totalSessions: number;
  avgDailyMinutes: number;
  streak: number;
  longestStreak: number;
  bestDayMinutes: number;
  bestDayDate: string | null;
  activeDays: number;
  daily: DailyStudyData[];      // last 30 days
  weekly: WeeklyStudyData[];    // last 12 weeks
  subjects: SubjectData[];
  taskCompletionRate: number;   // 0–100
  tasksCompleted: number;
  tasksTotal: number;
}

// ─── Profile stats (lightweight — avoids fetching full 30-day chart data) ────

export interface ProfileStats {
  totalSessions: number;
  totalMinutes: number;
  streak: number;
  taskCompletionRate: number;
  tasksTotal: number;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  daily_goal_minutes: number;
  preferred_session_minutes: number;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type ProfileFormData = {
  display_name: string;
};

export type SettingsFormData = {
  daily_goal_minutes: number;
  preferred_session_minutes: number;
  notifications_enabled: boolean;
};

// ─── AI Insights ─────────────────────────────────────────────────────────────

export interface AIInsightDashboard {
  headline: string;       // "3-5 word summary"
  insights: string[];     // 2-3 concise bullets
}

export interface AIInsightAnalytics {
  summary: string;        // 1-sentence pattern overview
  observations: string[]; // 3-4 detailed observations
}

export interface AIInsightContent {
  dashboard:    AIInsightDashboard;
  analytics:    AIInsightAnalytics;
  intelligence?: AIIntelligenceInsight;  // added by the intelligence analysis pass
  /** Stored alongside content so we can detect staleness without a separate column. */
  metadata?: {
    sessionCount: number;  // total sessions at generation time
  };
}

// ─── AI Intelligence (deep study-pattern analysis) ────────────────────────────

export interface AIIntelligenceInsight {
  consistencyNarrative: {
    label:   string;  // e.g. "Steady Builder", "Night Owl", "Sprint Learner"
    tagline: string;  // 1 natural sentence about their consistency pattern
  };
  burnoutAnalysis: {
    level:    "high" | "moderate" | "low";
    headline: string;   // e.g. "Healthy Pace", "Signs of Overload"
    insight:  string;   // 2-3 sentences analysing their work/rest balance
    signals:  string[]; // natural-language descriptions of each risk signal
  };
  personality: {
    type:    string;  // e.g. "The Evening Deep-Diver", "The Morning Sprint"
    emoji:   string;  // single emoji
    tagline: string;  // punchy 4-6 word phrase
    insight: string;  // 2-3 sentences about their study personality
  };
  weeklyNarrative:    string;  // narrative comparing this week vs last
  recommendations:    Array<{ emoji: string; title: string; detail: string }>;
  motivationalMessage: string; // short, warm, personal
}

export interface AIDailyInsight {
  id:           string;
  user_id:      string;
  insight_date: string;         // "YYYY-MM-DD"
  content:      AIInsightContent;
  generated_at: string;         // ISO timestamptz
}

// ─── Intelligence ─────────────────────────────────────────────────────────────

export interface ConsistencyScore {
  score:     number;  // 0–100 total
  label:     string;  // "Excellent" | "Strong" | "Good" | "Building" | "Inconsistent" | "Starting Out"
  color:     string;  // Tailwind text-color class
  ringColor: string;  // Hex for SVG stroke
  breakdown: {
    frequency:      number;  // 0–40 pts
    streak:         number;  // 0–25 pts
    regularity:     number;  // 0–20 pts
    recentActivity: number;  // 0–15 pts
  };
}

export type BurnoutLevel = "high" | "moderate" | "low";

export interface BurnoutSignal {
  label:       string;
  description: string;
}

export interface BurnoutRisk {
  level:   BurnoutLevel;
  signals: BurnoutSignal[];
  advice:  string;
}

export interface HourData {
  hour:      number;  // 0–23
  label:     string;  // "12am", "9am", "12pm" …
  minutes:   number;
  intensity: number;  // 0–1 normalised to peak hour
}

export interface BestStudyHours {
  peakHour:  number | null;
  peakLabel: string;
  hours:     HourData[];  // always 24 items
}

export interface FocusPersonality {
  type:        string;
  emoji:       string;
  description: string;
}

export interface WeeklyReport {
  thisWeekMinutes: number;
  lastWeekMinutes: number;
  changePercent:   number;  // signed integer
  trend:           "up" | "down" | "flat" | "new";
}

export interface IntelligenceData {
  consistency:     ConsistencyScore;
  burnout:         BurnoutRisk;
  bestHours:       BestStudyHours;
  personality:     FocusPersonality;
  weeklyReport:    WeeklyReport;
  recommendations: string[];
}

/** Minimal session shape needed by the intelligence engine. */
export interface RawSessionForIntelligence {
  duration_minutes: number;
  studied_at:       string;   // ISO 8601 timestamptz from Supabase
  subject?:         string;   // optional — used by the AI intelligence prompt
}

// ─── Live session ─────────────────────────────────────────────────────────────

export interface ActiveSession {
  subject:   string;
  startedAt: number; // Unix ms — mirrors lib/live-session.ts
}

// ─── Shared ───────────────────────────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface ExportResult extends ActionResult {
  csv?: string;
}
