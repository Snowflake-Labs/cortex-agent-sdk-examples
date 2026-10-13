# Authentication examples

Each file configures one supported authentication mechanism and then runs a
minimal create/send/result/delete conversation. Keep credentials and refresh
tokens in trusted server-side code.

| Example | Authentication |
| --- | --- |
| `pat.py` | Programmatic Access Token |
| `oauth.py` | OAuth access token with refresh hook |
| `session_token.py` | Existing `snowflake-connector-python` session |
| `key_pair_jwt.py` | Application-minted key-pair JWT |
| `custom_authenticator.py` | Custom header provider |
