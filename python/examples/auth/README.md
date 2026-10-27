<!--
Copyright 2026 Snowflake Inc.
SPDX-License-Identifier: Apache-2.0

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

# Authentication examples

Each file configures one supported authentication mechanism and then runs a
minimal create/send/result/delete conversation. Keep credentials and refresh
tokens in trusted server-side code.

Run examples from the repository root:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  python python/examples/auth/pat.py
```

| Example | Authentication |
| --- | --- |
| `pat.py` | Programmatic Access Token |
| `oauth.py` | OAuth access token with refresh hook |
| `session_token.py` | Existing `snowflake-connector-python` session |
| `key_pair_jwt.py` | Application-minted key-pair JWT |
| `custom_authenticator.py` | Custom header provider |

`_run_conversation.py` is a shared helper used by these examples.
