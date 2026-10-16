"""Natural Language Analytics Dashboard.

A Streamlit app that lets users ask questions about their data in plain
English.  Questions are routed to a Cortex Agent with the analyst
(text-to-SQL) tool, and the answer, generated SQL, and result table are
displayed.

Environment variables (all required unless noted):
    SNOWFLAKE_ACCOUNT          – Snowflake account identifier
    SNOWFLAKE_PAT              – Personal Access Token for authentication
    SNOWFLAKE_SEMANTIC_VIEW    – Fully-qualified semantic view name
    SNOWFLAKE_WAREHOUSE        – Warehouse for query execution (default: COMPUTE_WH)
"""

from __future__ import annotations

import json
import os

import streamlit as st
from cortex_agent_sdk.api import CortexAgentClient, StreamEvent

# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------
st.set_page_config(page_title="Natural Language Analytics", layout="wide")
st.title("Natural Language Analytics")
st.caption("Ask questions about your data in plain English")

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
account = os.environ["SNOWFLAKE_ACCOUNT"]
pat = os.environ["SNOWFLAKE_PAT"]
semantic_view = os.environ["SNOWFLAKE_SEMANTIC_VIEW"]
warehouse = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")

# ---------------------------------------------------------------------------
# Query input
# ---------------------------------------------------------------------------
question = st.text_input(
    "Your question",
    placeholder="What are the top 5 products by revenue?",
)

if question:
    client = CortexAgentClient(account=account, auth=pat)

    results: dict = {"answer": "", "sql": "", "table": None}

    with st.status("Querying your data…", expanded=True) as status:
        st.write("Sending question to Cortex Agent…")

        stream = client.agent.stream(
            {
                "models": {"orchestration": "auto"},
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": question}],
                    }
                ],
                "tools": [
                    {
                        "tool_spec": {
                            "type": "cortex_analyst_text_to_sql",
                            "name": "analyst",
                        }
                    }
                ],
                "tool_resources": {
                    "analyst": {
                        "semantic_view": semantic_view,
                        "execution_environment": {
                            "type": "warehouse",
                            "warehouse": warehouse,
                        },
                    }
                },
            }
        )

        # -- collect events ------------------------------------------------
        text_parts: list[str] = []
        errors: list[str] = []

        def on_text(delta: str, _accumulated: str) -> None:
            text_parts.append(delta)

        def on_tool_result(event: dict) -> None:
            for item in event.get("content") or []:
                if item.get("type") == "json":
                    payload = item.get("json") or {}
                    if "sql" in payload:
                        results["sql"] = payload["sql"]
                    if "tabular" in payload:
                        results["table"] = payload["tabular"]
                if item.get("type") == "tool_results_table":
                    results["table"] = item

        def on_status(event: dict) -> None:
            msg = event.get("message", "")
            if msg:
                st.write(msg)

        def on_error(event: dict) -> None:
            errors.append(str(event))

        stream.on(StreamEvent.TEXT, on_text)
        stream.on(StreamEvent.TOOL_RESULT, on_tool_result)
        stream.on(StreamEvent.STATUS, on_status)
        stream.on(StreamEvent.ERROR, on_error)
        stream.done()

        answer_text = "".join(text_parts)
        results["answer"] = answer_text
        status.update(label="Done", state="complete")

    if errors:
        for err in errors:
            st.error(err)

    if results["answer"]:
        st.markdown(results["answer"])

    if results["sql"]:
        st.subheader("Generated SQL")
        st.code(results["sql"], language="sql")

    if results["table"] is not None:
        st.subheader("Results")
        tabular_data = results["table"]
        if isinstance(tabular_data, dict):
            columns = tabular_data.get("columns") or []
            rows = tabular_data.get("rows") or []
            if columns and rows:
                st.dataframe(
                    [dict(zip(columns, row)) for row in rows],
                    use_container_width=True,
                )
            elif "data" in tabular_data:
                st.dataframe(tabular_data["data"], use_container_width=True)
            else:
                st.json(tabular_data)
        else:
            st.dataframe(tabular_data, use_container_width=True)
