// Copyright 2026 Snowflake Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Run against the local default OAuth setup:
 *
 * SNOWFLAKE_ACCOUNT=myaccount \
 * SNOWFLAKE_OAUTH_TOKEN_ENDPOINT=https://myaccount.snowflakecomputing.com/oauth/token-request \
 * SNOWFLAKE_OAUTH_CLIENT_ID=<oauth-client-id> \
 * SNOWFLAKE_OAUTH_CLIENT_SECRET=<oauth-client-secret> \
 * SNOWFLAKE_OAUTH_REFRESH_TOKEN=<oauth-refresh-token> \
 * npx tsx examples/auth/oauth.ts
 *
 * Optionally set SNOWFLAKE_OAUTH_ACCESS_TOKEN and SNOWFLAKE_OAUTH_EXPIRES_AT
 * (milliseconds since epoch) when restoring a persisted access-token cache.
 *
 * Where the values come from:
 * - Create the OAuth security integration (see oauth-setup.sql), then run
 *   DESCRIBE SECURITY INTEGRATION <name> to read OAUTH_CLIENT_ID.
 * - Run SELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('<name>') to retrieve its
 *   generated client secret. Store that value in a server-side secret manager.
 * - Start a one-time authorization-code login at the integration's
 *   OAUTH_AUTHORIZATION_ENDPOINT. Exchange its callback code at
 *   OAUTH_TOKEN_ENDPOINT with the client ID/secret; the response contains the
 *   refresh token. Persist that refresh token in the same secret manager.
 *
 * Long-running server OAuth authentication with proactive and reactive refresh.
 *
 * Configure a Snowflake OAuth token endpoint, or the token endpoint of the
 * external IdP configured in Snowflake. Keep the client secret and refresh token
 * in an encrypted server-side store, never in browser code.
 */
import { CortexAgentClient, OAuthAuth } from "@snowflake/cortex-agent-sdk";
import { runConversation } from "./run-conversation.js";

interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expiresAt: number;
}

const tokenEndpoint: string = process.env.SNOWFLAKE_OAUTH_TOKEN_ENDPOINT!;
const clientId: string = process.env.SNOWFLAKE_OAUTH_CLIENT_ID!;
const clientSecret: string = process.env.SNOWFLAKE_OAUTH_CLIENT_SECRET!;
let accessToken: string | undefined = process.env.SNOWFLAKE_OAUTH_ACCESS_TOKEN;
let refreshToken: string | undefined =
  process.env.SNOWFLAKE_OAUTH_REFRESH_TOKEN;
let expiresAt: number = Number(process.env.SNOWFLAKE_OAUTH_EXPIRES_AT ?? 0);
let refreshInProgress: Promise<void> | undefined;

async function exchangeRefreshToken(
  currentRefreshToken: string,
): Promise<OAuthTokens> {
  const response: Response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: currentRefreshToken,
    }),
  });
  if (!response.ok)
    throw new Error(`OAuth refresh failed: ${await response.text()}`);
  const payload = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expiresAt: Date.now() + payload.expires_in * 1_000,
  };
}

async function forceRefresh(): Promise<void> {
  if (!refreshToken) throw new Error("No OAuth refresh token is available.");
  refreshInProgress ??= exchangeRefreshToken(refreshToken)
    .then((tokens: OAuthTokens) => {
      accessToken = tokens.access_token;
      // OAuth providers can rotate this value; persist it in the app's encrypted token store.
      if (tokens.refresh_token) refreshToken = tokens.refresh_token;
      expiresAt = tokens.expiresAt;
    })
    .finally(() => {
      refreshInProgress = undefined;
    });
  await refreshInProgress;
}

async function getValidAccessToken(): Promise<string> {
  // Refresh early so a request does not begin with a nearly expired token.
  if (!accessToken || Date.now() >= expiresAt - 2 * 60_000)
    await forceRefresh();
  if (!accessToken)
    throw new Error("OAuth refresh did not return an access token.");
  return accessToken;
}

const client: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: new OAuthAuth(getValidAccessToken),
  // Re-run the app's real refresh exchange if Snowflake rejects a token early.
  refreshAuth: forceRefresh,
});

await runConversation(client);
