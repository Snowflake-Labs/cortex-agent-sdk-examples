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

/** Key-pair JWT authentication using Node's built-in crypto module. */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} from "node:crypto";
import { CallableAuth, CortexAgentClient } from "@snowflake/cortex-agent-sdk";
import { runConversation } from "./run-conversation.js";

const privateKeyPem: string = process.env.SNOWFLAKE_PRIVATE_KEY_PEM!;
const accountIdentifier: string =
  process.env.SNOWFLAKE_JWT_ACCOUNT_IDENTIFIER!.toUpperCase();
const username: string = process.env.SNOWFLAKE_USER!.toUpperCase();
const qualifiedUser: string = `${accountIdentifier}.${username}`;

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function publicKeyFingerprint(): string {
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKeyDer = createPublicKey(privateKey).export({
    type: "spki",
    format: "der",
  });
  return `SHA256:${createHash("sha256").update(publicKeyDer).digest("base64")}`;
}

function mintJwt(): string {
  const now: number = Math.floor(Date.now() / 1_000);
  const header: string = base64Url(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  );
  const payload: string = base64Url(
    JSON.stringify({
      iss: `${qualifiedUser}.${publicKeyFingerprint()}`,
      sub: qualifiedUser,
      iat: now,
      exp: now + 55 * 60,
    }),
  );
  const signed: string = `${header}.${payload}`;
  return `${signed}.${sign("RSA-SHA256", Buffer.from(signed), privateKeyPem).toString("base64url")}`;
}

const client: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: new CallableAuth(mintJwt, "KEYPAIR_JWT"),
  // A rejected JWT should be regenerated and immediately retried.
  refreshAuth: async () => undefined,
});

await runConversation(client);
