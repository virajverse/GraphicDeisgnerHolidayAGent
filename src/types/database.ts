/**
 * Database Domain Entity Types (Turso Cloud SQLite & In-Memory Cache)
 */

export interface UserRecord {
  id: string;
  name: string;
  username?: string;
  profession?: string;
  location?: string;
  industries?: string | string[];
  platforms?: string | string[];
  creative_preferences?: string | string[];
  notification_lead_days?: number;
  importance_threshold?: number;
  language?: string;
  telegram_chat_id: string;
  is_approved: number;
  role: 'ADMIN' | 'DESIGNER';
  registered_at?: string;
  updated_at?: string;
}

export interface ClientRecord {
  id: string;
  user_id: string;
  name: string;
  industry: string;
  location?: string;
  audience?: string;
  brand_tone: string;
  platforms?: string | string[];
  content_categories?: string | string[];
  avoid_topics?: string | string[];
  creative_style: string;
}

export interface EventRecord {
  id: string;
  name: string;
  description?: string;
  date: string;
  country?: string;
  region?: string;
  category?: string;
  importance?: number;
  source?: string;
  source_url?: string;
  source_date?: string;
  recurrence?: string;
  is_official?: number;
  is_active?: number;
}

export interface AlertRecord {
  id: string;
  user_id: string;
  event_id: string;
  client_id?: string | null;
  trigger_date: string;
  relevance_score: number;
  real_world_context?: string;
  sources_json?: string;
  recommended_ideas?: string;
  status: 'PENDING' | 'GENERATED' | 'SENT' | 'FAILED';
  telegram_message_id?: string;
  generated_at?: string;
  sent_at?: string;
}

export interface CreativeIdeaRecord {
  id: string;
  alert_id: string;
  event_id: string;
  user_id: string;
  client_id?: string | null;
  category: string;
  title: string;
  concept: string;
  visual_direction: string;
  headline: string;
  platform: string;
  audience: string;
  difficulty?: string;
  priority?: number;
  reasoning?: string;
  created_at?: string;
}

export interface FeedbackRecord {
  id: string;
  user_id: string;
  alert_id: string;
  idea_id?: string | null;
  rating: 'LIKE' | 'DISLIKE' | 'SAVED';
  notes?: string;
  created_at?: string;
}

export interface AgentLogRecord {
  id?: number;
  run_time?: string;
  events_checked: number;
  events_found: number;
  alerts_sent: number;
  duration_ms: number;
  status: 'SUCCESS' | 'FAILED';
  details?: string;
}
