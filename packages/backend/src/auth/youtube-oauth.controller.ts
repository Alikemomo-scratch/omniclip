import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ConnectionsService } from '../connections/connections.service';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * YouTube-specific YouTube Data API scopes.
 * readonly = read subscriptions, activities, video details.
 */
const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];

/**
 * Controller for YouTube OAuth 2.0 flow.
 *
 * Flow:
 * 1. GET /auth/youtube → redirects to Google consent screen
 * 2. GET /auth/youtube/callback?code=xxx → exchanges code for tokens → creates connection → redirects to frontend
 */
@Controller('auth/youtube')
export class YouTubeOAuthController {
  private readonly logger = new Logger(YouTubeOAuthController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly connectionsService: ConnectionsService,
  ) {}

  /**
   * Redirect user to Google OAuth consent screen.
   * The user must be authenticated (JWT) so we know who to associate the connection with.
   * We pass userId in the OAuth state parameter (signed within the redirect URI).
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  authorize(@Req() req: Request, @Query('sync_interval') syncInterval: string, @Res() res: Response) {
    const user = req.user as { userId: string };
    const clientId = this.configService.get<string>('youtube.clientId');
    const redirectUri = this.configService.get<string>('youtube.redirectUri');

    if (!clientId) {
      throw new BadRequestException('YouTube OAuth is not configured (missing client ID)');
    }

    const interval = parseInt(syncInterval, 10) || 60;
    const statePayload = `${user.userId}:${interval}`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri!,
      response_type: 'code',
      scope: YOUTUBE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: statePayload,
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    this.logger.log(`Redirecting user ${user.userId} to Google OAuth`);
    res.redirect(authUrl);
  }

  /**
   * Handle the OAuth callback from Google.
   * Exchange authorization code for tokens, create the YouTube connection,
   * then redirect to the frontend callback page.
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('frontendUrl');

    // Handle OAuth error (user denied, etc.)
    if (error) {
      this.logger.warn(`YouTube OAuth error: ${error}`);
      res.redirect(
        `${frontendUrl}/connections/youtube/callback?error=${encodeURIComponent(error)}`,
      );
      return;
    }

    if (!code || !state) {
      res.redirect(
        `${frontendUrl}/connections/youtube/callback?error=${encodeURIComponent('Missing authorization code or state')}`,
      );
      return;
    }

    const [userId, intervalStr] = state.split(':');
    const syncIntervalMinutes = parseInt(intervalStr, 10) || 60;

    try {
      const tokens = await this.exchangeCodeForTokens(code);

      await this.connectionsService.create(userId, {
        platform: 'youtube',
        connection_type: 'api',
        auth_data: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        },
        sync_interval_minutes: syncIntervalMinutes,
      });

      this.logger.log(`YouTube connection created for user ${userId}`);
      res.redirect(`${frontendUrl}/connections/youtube/callback?success=true`);
    } catch (err) {
      const message = (err as Error).message || 'Unknown error during OAuth callback';
      this.logger.error(`YouTube OAuth callback failed: ${message}`);
      res.redirect(
        `${frontendUrl}/connections/youtube/callback?error=${encodeURIComponent(message)}`,
      );
    }
  }

  /**
   * Exchange an authorization code for access + refresh tokens.
   */
  private async exchangeCodeForTokens(code: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    const clientId = this.configService.get<string>('youtube.clientId');
    const clientSecret = this.configService.get<string>('youtube.clientSecret');
    const redirectUri = this.configService.get<string>('youtube.redirectUri');

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri!,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Token exchange failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    if (!data.refresh_token) {
      throw new Error(
        'No refresh_token received — user may need to re-authorize with prompt=consent',
      );
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    };
  }
}
