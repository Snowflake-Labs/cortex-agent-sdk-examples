"""Pipeline Auditor — discover and audit data pipeline objects in a Snowflake database."""

from __future__ import annotations

import os

import streamlit as st

from cortex_agent_sdk import AgentResponse, Conversation, CortexAgentClient, Turn

st.set_page_config(page_title="Pipeline Auditor", page_icon="🔍")
st.title("Pipeline Auditor")
st.caption("Discover and audit your data pipeline objects")

# -- Session state defaults ----------------------------------------------------
if "messages" not in st.session_state:
    st.session_state.messages = []
if "conversation" not in st.session_state:
    st.session_state.conversation = None
if "client" not in st.session_state:
    st.session_state.client = None
if "db_name" not in st.session_state:
    st.session_state.db_name = ""

# -- Database input + audit button --------------------------------------------
col1, col2 = st.columns([3, 1])
with col1:
    db_name = st.text_input(
        "Database to audit",
        placeholder="MY_DATABASE",
        value=st.session_state.db_name,
    )
with col2:
    st.write("")  # vertical spacer
    st.write("")
    run_audit = st.button("Run Audit", type="primary", disabled=not db_name)

# -- Render chat history -------------------------------------------------------
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])


def _get_client() -> CortexAgentClient:
    if st.session_state.client is None:
        st.session_state.client = CortexAgentClient(
            account=os.environ["SNOWFLAKE_ACCOUNT"],
            auth=os.environ["SNOWFLAKE_PAT"],
        )
    return st.session_state.client


def _get_conversation() -> Conversation:
    if st.session_state.conversation is None:
        client = _get_client()
        st.session_state.conversation = client.conversations.create(
            origin_application="pipeline-auditor",
            agent={
                "type": "coding",
                "spec": {
                    "permission_policy": "always_allow",
                    "models": {"orchestration": "claude-sonnet-4-5"},
                },
            },
        )
    return st.session_state.conversation


def _send_and_display(message: str) -> None:
    st.session_state.messages.append({"role": "user", "content": message})
    with st.chat_message("user"):
        st.markdown(message)

    with st.chat_message("assistant"):
        with st.spinner("Auditing…"):
            conversation = _get_conversation()
            turn: Turn = conversation.send(message)
            response: AgentResponse = turn.result()
            reply = response.text
        st.markdown(reply)

    st.session_state.messages.append({"role": "assistant", "content": reply})


# -- Run Audit button handler --------------------------------------------------
if run_audit:
    st.session_state.db_name = db_name
    audit_prompt = (
        f"Audit the data pipeline objects in database {db_name}. For each object type:\n"
        f"1. Run SHOW DYNAMIC TABLES IN DATABASE {db_name} — check refresh status, scheduling lag, and any errors\n"
        f"2. Run SHOW TASKS IN DATABASE {db_name} — check state (suspended/started), schedule, last run status\n"
        f"3. Run SHOW STREAMS IN DATABASE {db_name} — check stale_after and whether they are being consumed\n"
        f"4. Run SHOW PIPES IN DATABASE {db_name} — check status and pending file count\n"
        "\n"
        "For each object found, report: name, type, status (healthy/warning/critical), and a one-line finding.\n"
        "Format the final report as a markdown table with columns: Object | Type | Status | Finding"
    )
    _send_and_display(audit_prompt)

# -- Follow-up chat input -----------------------------------------------------
if st.session_state.messages:
    if follow_up := st.chat_input("Ask a follow-up question…"):
        _send_and_display(follow_up)
