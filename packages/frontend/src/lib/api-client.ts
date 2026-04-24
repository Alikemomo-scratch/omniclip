const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

/**
 * Minimal API client for OmniClip backend.
 * Handles JWT token storage and automatic header injection.
 */

// Token storage — using localStorage for simplicity (spec allows secure localStorage)
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('omniclip_token');
}

/** Exported for components that need to read the token (e.g., OAuth redirect). */
export { getToken };

function setToken(token: string): void {
  localStorage.setItem('omniclip_token', token);
}

function setRefreshToken(token: string): void {
  localStorage.setItem('omniclip_refresh_token', token);
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('omniclip_refresh_token');
}

function clearTokens(): void {
  localStorage.removeItem('omniclip_token');
  localStorage.removeItem('omniclip_refresh_token');
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

class ApiClient {
  private baseUrl: string;
  /** Shared promise to coalesce concurrent refresh attempts. */
  private refreshPromise: Promise<boolean> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, options: RequestInit = {}, _isRetry = false): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        statusCode: response.status,
        error: response.statusText,
        message: 'Request failed',
      }));

      if (response.status === 401 && !_isRetry) {
        const refreshed = await this.tryRefresh();
        if (refreshed) {
          return this.request<T>(path, options, true);
        }
        clearTokens();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }

      throw error;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  private async tryRefresh(): Promise<boolean> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        try {
          const res = await fetch(`${this.baseUrl}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (!res.ok) return false;
          const data = await res.json();
          setToken(data.access_token);
          setRefreshToken(data.refresh_token);
          return true;
        } catch {
          return false;
        }
      })();
    }

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient(API_BASE);

// ====================================
// Auth API
// ====================================
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    display_name: string;
  };
}

export const authApi = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/login', data);
    setToken(res.access_token);
    setRefreshToken(res.refresh_token);
    return res;
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/register', data);
    setToken(res.access_token);
    setRefreshToken(res.refresh_token);
    return res;
  },

  async refresh(): Promise<AuthResponse> {
    const refreshToken = getRefreshToken();
    const res = await apiClient.post<AuthResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    });
    setToken(res.access_token);
    setRefreshToken(res.refresh_token);
    return res;
  },

  logout(): void {
    clearTokens();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },

  isAuthenticated(): boolean {
    return !!getToken();
  },
};

// ====================================
// Connections API
// ====================================
export interface Connection {
  id: string;
  platform: string;
  connection_type: string;
  status: string;
  sync_interval_minutes: number;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface CreateConnectionRequest {
  platform: string;
  connection_type: string;
  auth_data?: Record<string, unknown>;
  sync_interval_minutes?: number;
}

export const connectionsApi = {
  list(): Promise<{ connections: Connection[] }> {
    return apiClient.get('/connections');
  },

  listPlatforms(): Promise<{ platforms: string[] }> {
    return apiClient.get('/connections/platforms');
  },

  create(data: CreateConnectionRequest): Promise<Connection> {
    return apiClient.post('/connections', data);
  },

  update(id: string, data: Partial<CreateConnectionRequest>): Promise<Connection> {
    return apiClient.patch(`/connections/${id}`, data);
  },

  delete(id: string): Promise<void> {
    return apiClient.delete(`/connections/${id}`);
  },

  test(id: string): Promise<{ status: string; message: string }> {
    return apiClient.post(`/connections/${id}/test`);
  },

  syncNow(id: string): Promise<{ success: boolean; message: string }> {
    return apiClient.post(`/connections/${id}/sync`);
  },
};

// ====================================
// Content API
// ====================================
export interface ContentItem {
  id: string;
  platform: string;
  content_type: string;
  title: string | null;
  body: string | null;
  author_name: string | null;
  author_url: string | null;
  original_url: string;
  media_urls: string[];
  metadata: Record<string, unknown>;
  published_at: string;
  collected_at: string;
  ai_summary: string | null;
}

export interface ContentFeedResponse {
  items: ContentItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface ContentQuery {
  page?: number;
  limit?: number;
  platform?: string;
  content_type?: string;
  from?: string;
  to?: string;
  search?: string;
  archived?: boolean;
}

export const contentApi = {
  list(query: ContentQuery = {}): Promise<ContentFeedResponse> {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    });
    const qs = params.toString();
    return apiClient.get(`/content${qs ? `?${qs}` : ''}`);
  },

  getById(id: string): Promise<ContentItem> {
    return apiClient.get(`/content/${id}`);
  },

  archive(id: string): Promise<void> {
    return apiClient.patch(`/content/${id}/archive`);
  },

  unarchive(id: string): Promise<void> {
    return apiClient.patch(`/content/${id}/unarchive`);
  },

  delete(id: string): Promise<void> {
    return apiClient.delete(`/content/${id}`);
  },
};

// ====================================
// Users API
// ====================================
export interface User {
  id: string;
  email: string;
  display_name: string;
  preferred_language: string;
  digest_frequency: string;
  digest_time: string;
  timezone: string;
  content_retention_days: number;
  digest_prompt: string | null;
}

export const usersApi = {
  me(): Promise<User> {
    return apiClient.get('/users/me');
  },

  update(data: Partial<User>): Promise<User> {
    return apiClient.patch('/users/me', data);
  },
};

// ====================================
// Sync Jobs API
// ====================================
export interface SyncJob {
  id: string;
  connection_id: string;
  platform: string;
  status: string;
  items_collected: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export const syncApi = {
  listJobs(query: { connection_id?: string; status?: string } = {}): Promise<{ jobs: SyncJob[] }> {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) params.set(key, value);
    });
    const qs = params.toString();
    return apiClient.get(`/sync/jobs${qs ? `?${qs}` : ''}`);
  },
};

// ====================================
// Digests API
// ====================================
export interface TopicGroup {
  topic: string;
  summary: string;
  item_ids: string[];
  platforms: string[];
}

// New format (two-phase pipeline output)
export interface DigestHeadline {
  item_id: string;
  topic: string;
  title: string;
  analysis: string;
  platform: string;
  original_url: string;
}

export interface DigestCategoryItem {
  item_id: string;
  one_liner: string;
  platform: string;
  original_url: string;
}

export interface DigestCategory {
  topic: string;
  items: DigestCategoryItem[];
}

export interface DigestOutput {
  headlines: DigestHeadline[];
  categories: DigestCategory[];
  trend_analysis: string;
}

export interface Digest {
  id: string;
  digest_type: string;
  period_start: string;
  period_end: string;
  language: string;
  item_count: number;
  status: string;
  generated_at: string | null;
  topic_groups: DigestOutput | TopicGroup[];
  trend_analysis: string | null;
  created_at: string;
}

/** Check if topic_groups is in the new DigestOutput format */
export function isNewDigestFormat(topicGroups: DigestOutput | TopicGroup[]): topicGroups is DigestOutput {
  return topicGroups !== null && typeof topicGroups === 'object' && !Array.isArray(topicGroups) && 'headlines' in topicGroups;
}

export interface DigestsResponse {
  digests: Digest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface GenerateDigestRequest {
  digest_type: 'daily' | 'weekly';
  period_start: string;
  period_end: string;
}

export interface GenerateDigestResponse {
  id: string;
  status: string;
  message: string;
}

export const digestsApi = {
  list(query: { page?: number; limit?: number; type?: string; archived?: boolean } = {}): Promise<DigestsResponse> {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    });
    const qs = params.toString();
    return apiClient.get(`/digests${qs ? `?${qs}` : ''}`);
  },

  getById(id: string): Promise<Digest> {
    return apiClient.get(`/digests/${id}`);
  },

  generate(data: GenerateDigestRequest): Promise<GenerateDigestResponse> {
    return apiClient.post('/digests/generate', data);
  },

  archive(id: string): Promise<void> {
    return apiClient.patch(`/digests/${id}/archive`);
  },

  unarchive(id: string): Promise<void> {
    return apiClient.patch(`/digests/${id}/unarchive`);
  },

  delete(id: string): Promise<void> {
    return apiClient.delete(`/digests/${id}`);
  },
};
