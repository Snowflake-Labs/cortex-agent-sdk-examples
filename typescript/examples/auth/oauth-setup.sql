-- Copyright 2026 Snowflake Inc.
-- SPDX-License-Identifier: Apache-2.0
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
-- http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

-- One-time Snowflake OAuth setup used by oauth.ts.
-- Run with a privileged connection. This creates isolated test
-- resources; do not reuse their client secret or refresh tokens in production.

CREATE ROLE IF NOT EXISTS CORTEX_AGENT_ROLE;

CREATE SECURITY INTEGRATION CORTEX_AGENT_SDK_OAUTH_EXAMPLE
  TYPE = OAUTH
  ENABLED = TRUE
  OAUTH_CLIENT = CUSTOM
  OAUTH_CLIENT_TYPE = CONFIDENTIAL
  OAUTH_REDIRECT_URI = 'http://localhost:9876/callback'
  OAUTH_ALLOW_NON_TLS_REDIRECT_URI = TRUE
  OAUTH_ISSUE_REFRESH_TOKENS = TRUE
  OAUTH_REFRESH_TOKEN_VALIDITY = 86400
  PRE_AUTHORIZED_ROLES_LIST = ('CORTEX_AGENT_ROLE')
  COMMENT = 'Dedicated local OAuth client for Cortex Agent SDK auth example';

-- The test user is deliberately separate from existing developer/test users.
-- Choose a strong secret outside this file, store it in a secret manager, and
-- replace <password> before executing.
CREATE USER CORTEX_AGENT_SDK_OAUTH_USER
  PASSWORD = '<password>'
  MUST_CHANGE_PASSWORD = FALSE
  DEFAULT_ROLE = CORTEX_AGENT_ROLE
  COMMENT = 'Dedicated temporary user for Cortex Agent SDK OAuth example';

GRANT ROLE CORTEX_AGENT_ROLE TO USER CORTEX_AGENT_SDK_OAUTH_USER;

-- Copy the endpoint/client values into the oauth.ts command above. The client
-- secret is intentionally only returned at query time: store it securely.
DESCRIBE SECURITY INTEGRATION CORTEX_AGENT_SDK_OAUTH_EXAMPLE;
SELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('CORTEX_AGENT_SDK_OAUTH_EXAMPLE');

-- Obtain a refresh token once through the authorization-code flow:
-- https://myaccount.snowflakecomputing.com/oauth/authorize
-- ?response_type=code&client_id=<client-id>&redirect_uri=http://localhost:9876/callback
-- &scope=refresh_token%20session:role:CORTEX_AGENT_ROLE
-- Exchange that code at /oauth/token-request using the confidential client.
