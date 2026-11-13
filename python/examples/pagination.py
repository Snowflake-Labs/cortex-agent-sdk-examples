# Copyright 2026 Snowflake Inc.
# SPDX-License-Identifier: Apache-2.0
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Auto-pagination with ``ThreadsPage``.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/pagination.py
"""

from __future__ import annotations

import os

from snowflake.cortex.agents.api import CortexAgentClient

client = CortexAgentClient(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

# --- Example 1: Auto-pagination (iterating the page walks every page) ---
print("=== Auto-pagination (page_size=3) ===")
count = 0
for thread in client.threads.list(page_size=3):
    print(f'  thread_id={thread["thread_id"]} name="{thread.get("thread_name") or "(untitled)"}"')
    count += 1
    if count >= 10:
        break
print(f"  (iterated {count} threads)")

# --- Example 2: Manual pagination ---
print("\n=== Manual pagination ===")
current_page = client.threads.list(page_size=2)
page_num = 1
while True:
    print(f"  Page {page_num}: {len(current_page.data)} threads")
    for thread in current_page.data:
        print(f"    thread_id={thread['thread_id']}")
    if not current_page.has_more:
        break
    if page_num >= 3:
        print("  (stopping at page 3 for demo)")
        break
    current_page = current_page.get_next_page()
    page_num += 1

# --- Example 3: First page only (.data) ---
print("\n=== First page only (.data) ===")
first_page = client.threads.list(page_size=5)
print(f"  Got {len(first_page.data)} threads on first page")
print(f"  has_more: {first_page.has_more}")
