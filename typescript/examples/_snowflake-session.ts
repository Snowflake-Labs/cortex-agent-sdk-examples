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

import snowflake, {
  type Connection,
  type ConnectionOptions,
} from "snowflake-sdk";
import { loadConnectionConfiguration } from "snowflake-sdk/dist/lib/configuration/connection_configuration.js";
import { SnowflakeSessionTokenAuth } from "@snowflake/cortex-agent-sdk";

export interface SessionConnection {
  connection: Connection;
  options: ConnectionOptions;
  auth: SnowflakeSessionTokenAuth;
}

export function loadConnectionProfile(
  connectionName: string = process.env.CORTEX_EXAMPLE_CONNECTION ?? "default",
): ConnectionOptions {
  const previous: string | undefined =
    process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME;
  process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME = connectionName;
  try {
    return loadConnectionConfiguration() as ConnectionOptions;
  } finally {
    if (previous === undefined)
      delete process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME;
    else process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME = previous;
  }
}

export async function connect(options: ConnectionOptions): Promise<Connection> {
  const connection: Connection = snowflake.createConnection(options);
  await connection.connectAsync();
  return connection;
}

export async function connectFromProfile(
  connectionName?: string,
): Promise<SessionConnection> {
  const options = loadConnectionProfile(connectionName);
  const connection = await connect(options);
  return {
    connection,
    options,
    auth: new SnowflakeSessionTokenAuth(() => sessionToken(connection)),
  };
}

export function sessionToken(connection: Connection): string {
  const serialized: unknown = JSON.parse(connection.serialize());
  const token: unknown = (
    serialized as {
      services?: { sf?: { tokenInfo?: { sessionToken?: unknown } } };
    }
  ).services?.sf?.tokenInfo?.sessionToken;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("The Snowflake connection did not yield a session token.");
  }
  return token;
}

export function endpoint(
  options: ConnectionOptions,
): { baseUrl: string } | { account: string } {
  if (options.accessUrl) return { baseUrl: options.accessUrl };
  if (options.account) return { account: options.account };
  throw new Error("Connection options did not include accessUrl or account.");
}
