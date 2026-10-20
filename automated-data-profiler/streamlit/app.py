"""Automated Data Profiler — point it at a table, get a comprehensive quality report."""

from __future__ import annotations

import os

import streamlit as st
from cortex_agent_sdk import AgentResponse, Conversation, CortexAgentClient, Turn

st.set_page_config(page_title="Automated Data Profiler", page_icon="🔍")
st.title("Automated Data Profiler")
st.caption("Point it at a table — get a comprehensive quality report")

# -- Session state defaults ----------------------------------------------------
if "messages" not in st.session_state:
    st.session_state.messages = []
if "conversation" not in st.session_state:
    st.session_state.conversation = None
if "client" not in st.session_state:
    st.session_state.client = None

PROFILING_PROMPT = """Profile the table {table_name}. Run these checks:
1. DESCRIBE TABLE {table_name} to get the schema
2. SELECT COUNT(*) and COUNT(DISTINCT ...) for row count and cardinality per column
3. For each column, calculate null rate: COUNT(*) - COUNT(col) as null_count
4. For numeric columns: MIN, MAX, AVG, STDDEV
5. For string/categorical columns (cardinality < 50): value distribution (top 10 values by count)
6. For numeric columns: flag values beyond 3 standard deviations as potential outliers
7. Check table freshness: query INFORMATION_SCHEMA.TABLES for last_altered

Format the report as:
- **Schema Overview**: column name, type, nullable
- **Quality Summary**: a markdown table with columns: Column | Null Rate | Cardinality | Issues
- **Numeric Stats**: a markdown table with: Column | Min | Max | Mean | StdDev | Outliers
- **Freshness**: when the table was last altered
"""


def get_client() -> CortexAgentClient:
    if st.session_state.client is None:
        st.session_state.client = CortexAgentClient(
            account=os.environ["SNOWFLAKE_ACCOUNT"],
            auth=os.environ["SNOWFLAKE_PAT"],
        )
    return st.session_state.client


def get_conversation(client: CortexAgentClient) -> Conversation:
    if st.session_state.conversation is None:
        st.session_state.conversation = client.conversations.create(
            origin_application="automated-data-profiler",
            agent={
                "type": "coding",
                "spec": {
                    "permission_policy": "always_allow",
                    "models": {"orchestration": "claude-sonnet-4-5"},
                },
            },
        )
    return st.session_state.conversation


def send_message(text: str) -> str:
    client = get_client()
    conversation = get_conversation(client)
    turn: Turn = conversation.send(text)
    response: AgentResponse = turn.result()
    return response.text


# -- Render chat history -------------------------------------------------------
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# -- Table input + profile button ----------------------------------------------
if not st.session_state.messages:
    table_name = st.text_input(
        "Fully-qualified table name",
        placeholder="MY_DB.MY_SCHEMA.MY_TABLE",
    )
    if st.button("Profile Table", disabled=not table_name):
        prompt = PROFILING_PROMPT.format(table_name=table_name)

        st.session_state.messages.append({"role": "user", "content": f"Profile **{table_name}**"})
        with st.chat_message("user"):
            st.markdown(f"Profile **{table_name}**")

        with st.chat_message("assistant"):
            with st.spinner("Profiling table — this may take a minute…"):
                reply = send_message(prompt)
            st.markdown(reply)

        st.session_state.messages.append({"role": "assistant", "content": reply})
        st.rerun()

# -- Follow-up chat input ------------------------------------------------------
if st.session_state.messages:
    if follow_up := st.chat_input("Ask a follow-up question…"):
        st.session_state.messages.append({"role": "user", "content": follow_up})
        with st.chat_message("user"):
            st.markdown(follow_up)

        with st.chat_message("assistant"):
            with st.spinner("Thinking…"):
                reply = send_message(follow_up)
            st.markdown(reply)

        st.session_state.messages.append({"role": "assistant", "content": reply})
        st.rerun()
