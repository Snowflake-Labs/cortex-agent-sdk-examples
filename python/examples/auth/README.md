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
