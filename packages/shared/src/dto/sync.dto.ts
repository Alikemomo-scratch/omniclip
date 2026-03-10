import type { ContentItemInput } from '../types/connector';

/**
 * DTO for extension sync payload.
 */
export interface ExtensionSyncPayload {
  platform: string;
  connection_id: string;
  items: ContentItemInput[];
  sync_metadata: {
    collected_at: string;
    items_in_buffer: number;
    extension_version: string;
  };
}

/**
 * DTO for extension sync response.
 */
export interface ExtensionSyncResponse {
  accepted: number;
  duplicates_updated: number;
  errors: Array<{
    external_id: string;
    error: string;
    message: string;
  }>;
  next_sync_at?: string;
}

/**
 * DTO for heartbeat request.
 */
export interface HeartbeatPayload {
  connection_id: string;
  platform: string;
  status: 'active' | 'error';
  last_collection_at?: string;
  items_buffered?: number;
  errors?: string[];
  error_type?: string;
  error_message?: string;
}

/**
 * DTO for heartbeat response.
 */
export interface HeartbeatResponse {
  ack: boolean;
  sync_interval_minutes: number;
  connection_status: string;
}
