import streamlit as st

st.set_page_config(page_title="Eigenstate AI", layout="wide")

st.title("🛡️ Eigenstate: Codebase Digital Twin")
st.markdown("""
### Transforming Git History into Engineering Wisdom
Eigenstate uses *GraphRAG* to help developers understand the intent behind every change.
- *Analyze* complex PRs instantly.
- *Trace* bugs back to business requirements.
- *Onboard* new devs with a "Second Brain" for your repo.
""")

st.info("Select a tool from the sidebar to get started.")

import streamlit as st
import pandas as pd
import psycopg2

# Set dark theme configuration
st.set_page_config(layout="wide", page_title="Eigenstate")

# --- CUSTOM CSS FOR THE MOCKUP BLOCKS ---
st.markdown("""
    <style>
    .main { background-color: #0e1117; }
    .decision-box { 
        background-color: #1e2a1e; border-left: 5px solid #4caf50; 
        padding: 15px; border-radius: 8px; margin-bottom: 20px; color: #d1d1d1;
    }
    .reason-box { 
        background-color: #161b33; border-left: 5px solid #2196f3; 
        padding: 15px; border-radius: 8px; margin-bottom: 20px; color: #d1d1d1;
    }
    .tradeoff-box { 
        background-color: #2a2118; border-left: 5px solid #ff9800; 
        padding: 15px; border-radius: 8px; margin-bottom: 20px; color: #d1d1d1;
    }
    .evidence-item { color: #888; font-family: monospace; font-size: 0.9em; }
    </style>
""", unsafe_allow_html=True)

# --- DATABASE CONNECTION ---
def get_data(fn_name):
    # [span_6](start_span)[span_7](start_span)This queries your Phase 2 decision table[span_6](end_span)[span_7](end_span)
    conn = psycopg2.connect(dbname="eigenstate", user="postgres", password="your_password")
    query = f"SELECT * FROM decisions d JOIN functions f ON d.function_id = f.id WHERE f.name = '{fn_name}'"
    df = pd.read_sql(query, conn)
    conn.close()
    return df

# --- SIDEBAR (Left Panel) ---
with st.sidebar:
    st.title("Eigenstate")
    st.button("Dashboard")
    st.button("Code Explorer")
    st.divider()
    # [span_8](start_span)[span_9](start_span)Populate this from your 'functions' table[span_8](end_span)[span_9](end_span)
    selected_fn = st.selectbox("Functions", ["authMiddleware", "checkUser", "logoutUser"])

# --- WHY PANEL (Right Panel) ---
st.title(f"Why: {selected_fn}")

data = get_data(selected_fn)

if not data.empty:
    res = data.iloc[0]
    
    # 1. Decision Section
    st.write("### Decision:")
    st.markdown(f'<div class="decision-box">{res["decision_text"]}</div>', unsafe_allow_html=True)

    # 2. Reason Section
    st.write("### Reason:")
    st.markdown(f'<div class="reason-box">{res["reason_text"]}</div>', unsafe_allow_html=True)

    # 3. Tradeoff Section
    st.write("### Tradeoff:")
    st.markdown(f'<div class="tradeoff-box">{res["tradeoff_text"]}</div>', unsafe_allow_html=True)

    # 4. Evidence & Source (Bottom Split)
    col_ev, col_src = st.columns([2, 1])
    with col_ev:
        st.write("### Evidence:")
        st.markdown(f'<p class="evidence-item">- PR comment: "{res["evidence_primary"]}"</p>', unsafe_allow_html=True)
        st.markdown(f'<p class="evidence-item">- Code diff: {res["diff_pattern"]}</p>', unsafe_allow_html=True)
    
    with col_src:
        st.write("### Source:")
        st.write(f"PR #{res['github_pr_id']}")
        st.write(f"Confidence: *{res['confidence_level']}*")