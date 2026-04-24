export type TwitterAuthData = {
  api_key?: string;
  auth_token?: string;
  ct0?: string;
  next_cursor?: string;
};

export type TwitterCredentialInput =
  | {
      api_key: string;
    }
  | {
      auth_token: string;
      ct0: string;
    };

export type SerializedTweet = {
  id: string;
  fullText: string;
  createdAt: string;
  tweetBy: {
    userName: string;
  };
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  quoted?: unknown;
  media?: { url: string }[];
  urls?: string[];
  entities?: {
    urls?: string[];
  };
};
