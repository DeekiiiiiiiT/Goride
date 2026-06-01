import type {
  RideMessageDto,
  RideMessagesResponse,
  SendRideMessageBody,
  SendRideMessageResponse,
} from '@roam/types/rides';
import type { SupabaseClient } from '@supabase/supabase-js';

export type RideChatApi = {
  listMessages: (
    rideId: string,
    opts?: { limit?: number; before?: string },
  ) => Promise<RideMessagesResponse>;
  sendMessage: (rideId: string, body: SendRideMessageBody) => Promise<SendRideMessageResponse>;
};

export type RideChatVariant = 'rider' | 'driver';

export type RideChatContext = {
  unreadCount: number;
};

export type { RideMessageDto };
