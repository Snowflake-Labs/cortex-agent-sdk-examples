"""App Builder Agent — describe a data app and a Cortex Coding Agent builds it."""

from __future__ import annotations

import os

import streamlit as st
from cortex_agent_sdk import AgentResponse, CortexAgentClient, Turn

st.set_page_config(page_title="App Builder Agent", page_icon="\u2692\ufe0f")
st.title("App Builder Agent")
st.caption("Describe the app you want \u2014 an AI agent builds it")

# -- Session state defaults --------------------------------------------------
if "messages" not in st.session_state:
    st.session_state.messages = []
if "conversation" not in st.session_state:
    st.session_state.conversation = None
if "client" not in st.session_state:
    st.session_state.client = None

# -- Render chat history ------------------------------------------------------
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# -- Handle new input ---------------------------------------------------------
if prompt := st.chat_input("Describe the app you want to build\u2026"):
    # Show the user message immediately
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        with st.spinner("Building\u2026"):
            # First message: create client + conversation
            if st.session_state.client is None:
                st.session_state.client = CortexAgentClient(
                    account=os.environ["SNOWFLAKE_ACCOUNT"],
                    auth=os.environ["SNOWFLAKE_PAT"],
                )

            if st.session_state.conversation is None:
                st.session_state.conversation = st.session_state.client.conversations.create(
                    origin_application="app-builder",
                    agent={
                        "type": "coding",
                        "spec": {
                            "permission_policy": "always_allow",
                            "models": {"orchestration": "claude-sonnet-4-5"},
                        },
                    },
                )

            turn: Turn = st.session_state.conversation.send(prompt)
            response: AgentResponse = turn.result()
            reply = response.text

        st.markdown(reply)

    st.session_state.messages.append({"role": "assistant", "content": reply})
