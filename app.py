import streamlit as st
from datetime import datetime, timedelta
from collections import Counter, defaultdict
from db import (
    load_entries, load_entry, add_entry, update_entry, delete_entry,
    get_due_for_review, upload_image, get_next_review_date,
    get_supabase, get_authed_supabase,
    USMLE_SUBJECTS, ORGAN_SYSTEMS, MISTAKE_TYPES,
)
from io import BytesIO
from analyze import extract_text_ocr, analyze_with_groq, generate_flashcards
from streamlit_paste_button import paste_image_button
import streamlit_antd_components as sac
from streamlit_cookies_controller import CookieController

st.set_page_config(
    page_title="Mistake Notebook — USMLE Step 1",
    page_icon="📝",
    layout="wide",
)

cookie_manager = CookieController()


# ===================== AUTH =====================
def render_login():
    """Show login/signup page."""
    st.markdown("""
    <div class="login-header">
        <h1>Mistake Notebook</h1>
        <p>USMLE Step 1 Study Tool</p>
    </div>
    """, unsafe_allow_html=True)

    tab_login, tab_signup = st.tabs(["Log In", "Sign Up"])

    with tab_login:
        email = st.text_input("Email", key="login_email")
        password = st.text_input("Password", type="password", key="login_password")
        if st.button("Log In", type="primary", use_container_width=True):
            if not email or not password:
                st.error("Please enter email and password.")
                return
            sb = get_supabase()
            try:
                res = sb.auth.sign_in_with_password({"email": email, "password": password})
                st.session_state.access_token = res.session.access_token
                st.session_state.user_id = res.user.id
                st.session_state.user_email = res.user.email
                save_auth_cookies()
                st.rerun()
            except Exception as e:
                st.error(f"Login failed: {e}")

    with tab_signup:
        new_email = st.text_input("Email", key="signup_email")
        new_password = st.text_input("Password", type="password", key="signup_password")
        confirm_password = st.text_input("Confirm Password", type="password", key="signup_confirm")
        if st.button("Sign Up", type="primary", use_container_width=True):
            if not new_email or not new_password:
                st.error("Please enter email and password.")
                return
            if new_password != confirm_password:
                st.error("Passwords don't match.")
                return
            sb = get_supabase()
            try:
                res = sb.auth.sign_up({"email": new_email, "password": new_password})
                if res.user and res.session:
                    st.session_state.access_token = res.session.access_token
                    st.session_state.user_id = res.user.id
                    st.session_state.user_email = res.user.email
                    save_auth_cookies()
                    st.rerun()
                else:
                    st.success("Check your email for a confirmation link, then log in.")
            except Exception as e:
                st.error(f"Sign up failed: {e}")


def get_sb():
    """Get the authenticated Supabase client from session state."""
    token = st.session_state.get("access_token")
    if not token:
        return None
    return get_authed_supabase(token)


def is_logged_in():
    # Check session state first
    if st.session_state.get("access_token"):
        return True
    # Try restoring from cookies
    token = cookie_manager.get("mn_access_token")
    if token:
        st.session_state.access_token = token
        st.session_state.user_id = cookie_manager.get("mn_user_id") or ""
        st.session_state.user_email = cookie_manager.get("mn_user_email") or ""
        return True
    return False


def save_auth_cookies():
    """Save auth data to cookies."""
    cookie_manager.set("mn_access_token", st.session_state.get("access_token", ""))
    cookie_manager.set("mn_user_id", st.session_state.get("user_id", ""))
    cookie_manager.set("mn_user_email", st.session_state.get("user_email", ""))


def logout():
    for key in ["access_token", "user_id", "user_email"]:
        st.session_state.pop(key, None)
    cookie_manager.remove("mn_access_token")
    cookie_manager.remove("mn_user_id")
    cookie_manager.remove("mn_user_email")
    st.session_state.page = "dashboard"
    st.rerun()

# --- Custom CSS (Bootcamp.com-inspired dark theme) ---
st.markdown("""
<style>
    /* --- Fonts --- */
    @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700;900&family=Inter:wght@400;500;600;700&display=swap');

    /* --- Global --- */
    .stApp {
        max-width: 980px;
        margin: 0 auto;
    }

    .block-container { padding-top: 1.5rem; padding-bottom: 2rem; }
    h1 { font-family: 'Merriweather', serif !important; font-size: 1.8rem !important; font-weight: 900 !important; letter-spacing: -0.02em; color: #f1f5f9 !important; }
    h2 { font-family: 'Merriweather', serif !important; font-size: 1.3rem !important; font-weight: 700 !important; color: #e2e8f0 !important; margin-top: 1.2rem !important; }
    h3 { font-family: 'Merriweather', serif !important; font-size: 1.05rem !important; font-weight: 700 !important; color: #cbd5e1 !important; }
    h4 { font-family: 'Merriweather', serif !important; font-size: 0.9rem !important; font-weight: 700 !important; color: #94a3b8 !important; }
    p, li, span, div { font-family: 'Inter', sans-serif; }

    .stMarkdown, .stCaption { margin-bottom: 0 !important; }
    hr { margin: 0.75rem 0 !important; border-color: #1e293b !important; }

    /* --- Stat Cards --- */
    .stat-card {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 22px 18px;
        text-align: center;
        transition: all 0.2s ease;
    }
    .stat-card:hover {
        border-color: #3b82f6;
        box-shadow: 0 0 20px rgba(59,130,246,0.15);
        transform: translateY(-2px);
    }
    .stat-number { font-family: 'Merriweather', serif; font-size: 2rem; font-weight: 900; color: #f8fafc; line-height: 1.1; }
    .stat-label {
        font-size: 0.65rem; font-weight: 600; color: #64748b;
        text-transform: uppercase; letter-spacing: 0.06em; margin-top: 6px;
    }

    /* --- Tags --- */
    .tag {
        display: inline-flex; align-items: center;
        padding: 4px 12px;
        border-radius: 6px;
        font-size: 0.68rem;
        font-weight: 600;
        margin-right: 6px;
        margin-bottom: 6px;
        letter-spacing: 0.02em;
        line-height: 1.4;
    }
    .tag-subject { background: #1e3a5f; color: #60a5fa; }
    .tag-system { background: #14332a; color: #34d399; }
    .tag-mistake { background: #3b1525; color: #fb7185; }
    .tag-due { background: #3b2f1a; color: #fbbf24; animation: pulse-tag 2s infinite; }
    @keyframes pulse-tag { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }

    /* --- Content Boxes --- */
    .section-box, .green-box, .amber-box, .blue-box, .purple-box, .red-box {
        border-radius: 10px;
        padding: 20px 22px;
        margin-bottom: 12px;
        font-size: 0.88rem;
        line-height: 1.6;
        color: #e2e8f0;
    }
    .section-box {
        background: #1e293b;
        border: 1px solid #334155;
    }
    .green-box { background: #0c2a1f; border: 1px solid #065f46; }
    .amber-box { background: #2a2312; border: 1px solid #92400e; }
    .blue-box { background: #0c1e33; border: 1px solid #1e40af; }
    .purple-box { background: #1a1033; border: 1px solid #5b21b6; }
    .red-box { background: #2a1215; border: 1px solid #991b1b; }

    .heading-xs {
        font-size: 0.6rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        margin-bottom: 10px;
    }

    /* --- Entry Card --- */
    .entry-card {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 10px;
        padding: 16px 20px;
        margin-bottom: 8px;
        transition: all 0.15s ease;
    }
    .entry-card:hover {
        border-color: #3b82f6;
        box-shadow: 0 0 16px rgba(59,130,246,0.1);
    }

    /* --- Buttons --- */
    .stButton > button {
        border-radius: 8px !important;
        font-weight: 600 !important;
        font-size: 0.82rem !important;
        padding: 0.5rem 1.25rem !important;
        transition: all 0.15s ease !important;
        letter-spacing: 0.01em !important;
    }
    .stButton > button:hover {
        transform: translateY(-1px);
    }
    .stButton > button[kind="primary"] {
        background: #2563eb !important;
        border: none !important;
        color: white !important;
    }
    .stButton > button[kind="primary"]:hover {
        background: #1d4ed8 !important;
        box-shadow: 0 4px 16px rgba(37,99,235,0.3) !important;
    }

    /* --- Inputs --- */
    .stTextInput > div > div > input,
    .stTextArea > div > div > textarea,
    .stSelectbox > div > div {
        border-radius: 8px !important;
        font-size: 0.88rem !important;
    }

    /* --- Progress bars --- */
    .stProgress > div > div > div {
        background: linear-gradient(90deg, #2563eb, #3b82f6) !important;
        border-radius: 4px !important;
    }

    /* --- Dividers --- */
    .stDivider { opacity: 0.3; }

    /* --- Dataframes --- */
    .stDataFrame { border-radius: 8px; overflow: hidden; }

    /* --- Login page --- */
    .login-header {
        text-align: center;
        margin-bottom: 2rem;
    }
    .login-header h1 {
        font-size: 1.6rem !important;
        margin-bottom: 4px !important;
    }
    .login-header p {
        color: #64748b;
        font-size: 0.85rem;
        font-family: 'Inter', sans-serif;
    }

    /* --- Tabs override --- */
    .stTabs [data-baseweb="tab-list"] {
        gap: 0;
        background: #1e293b;
        border-radius: 8px;
        padding: 3px;
    }
    .stTabs [data-baseweb="tab"] {
        border-radius: 6px;
        font-weight: 600;
        font-size: 0.85rem;
        padding: 8px 20px;
    }
    .stTabs [aria-selected="true"] {
        background: #334155 !important;
    }

    /* --- Flashcards --- */
    .flashcard-front, .flashcard-back {
        border-radius: 10px;
        padding: 22px 24px;
        display: flex;
        align-items: center;
        font-size: 0.9rem;
        line-height: 1.55;
    }
    .flashcard-front {
        background: #1e293b;
        border: 1px solid #334155;
        color: #e2e8f0;
        font-weight: 600;
    }
    .flashcard-back {
        background: #2563eb;
        color: white;
        font-weight: 500;
    }
    .flashcard-badge {
        position: absolute;
        top: 10px;
        right: 14px;
        font-size: 0.6rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        opacity: 0.5;
    }

    /* --- Scrollbar --- */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }
</style>
""", unsafe_allow_html=True)


# --- Navigation ---
if "page" not in st.session_state:
    st.session_state.page = "dashboard"
if "view_id" not in st.session_state:
    st.session_state.view_id = None
if "review_idx" not in st.session_state:
    st.session_state.review_idx = 0
if "review_show" not in st.session_state:
    st.session_state.review_show = False


def go(page, view_id=None):
    st.session_state.page = page
    st.session_state.view_id = view_id
    if page == "review":
        st.session_state.review_idx = 0
        st.session_state.review_show = False
        st.session_state.pop("flashcards", None)


def render_flashcards(entry: dict, key_prefix: str = "fc"):
    """Render AI-generated flashcards for a mistake entry."""
    fc_key = f"{key_prefix}_cards_{entry['id']}"

    if st.button("Generate Flashcards", key=f"{key_prefix}_gen_{entry['id']}", type="primary", use_container_width=True):
        with st.spinner("Generating flashcards with Groq..."):
            cards = generate_flashcards(entry, count=7)
            if cards:
                st.session_state[fc_key] = cards
                st.rerun()
            else:
                st.warning("Failed to generate flashcards.")

    cards = st.session_state.get(fc_key, [])
    if not cards:
        return

    st.markdown("#### Flashcards")
    st.caption("Click 'Flip' to reveal the answer")

    for i, card in enumerate(cards):
        card_id = f"{key_prefix}_{entry['id']}_{i}"
        flipped_key = f"flip_{card_id}"
        if flipped_key not in st.session_state:
            st.session_state[flipped_key] = False

        is_flipped = st.session_state[flipped_key]

        if not is_flipped:
            st.markdown(f"""
            <div class="flashcard-front" style="position:relative; min-height:auto;">
                <div class="flashcard-badge">Q{i+1}</div>
                <div>{card['front']}</div>
            </div>
            """, unsafe_allow_html=True)
            if st.button("Flip", key=f"flip_btn_{card_id}", use_container_width=True):
                st.session_state[flipped_key] = True
                st.rerun()
        else:
            st.markdown(f"""
            <div class="flashcard-back" style="position:relative; min-height:auto; transform:none;">
                <div class="flashcard-badge">A{i+1}</div>
                <div>{card['back']}</div>
            </div>
            """, unsafe_allow_html=True)
            if st.button("Hide", key=f"hide_btn_{card_id}", use_container_width=True):
                st.session_state[flipped_key] = False
                st.rerun()

    if st.button("Regenerate Cards", key=f"{key_prefix}_regen_{entry['id']}"):
        with st.spinner("Regenerating..."):
            cards = generate_flashcards(entry, count=7)
            if cards:
                st.session_state[fc_key] = cards
                # Reset all flip states
                for i in range(len(cards)):
                    st.session_state.pop(f"flip_{key_prefix}_{entry['id']}_{i}", None)
                st.rerun()


# ===================== DASHBOARD =====================
def render_dashboard():
    sb = get_sb()
    entries = load_entries(sb)
    due = get_due_for_review(sb)

    st.title("Mistake Notebook")
    st.caption(f"USMLE Step 1 · {len(entries)} entries logged")

    if len(due) > 0:
        sac.alert(
            label=f"You have {len(due)} entries due for review",
            description="Head to Review from the sidebar to start.",
            icon=True, banner=True, color="warning", size="sm",
        )

    # Stats
    if entries:
        cols = st.columns(4)
        with cols[0]:
            st.markdown(f'<div class="stat-card"><div class="stat-number">{len(entries)}</div><div class="stat-label">Total Mistakes</div></div>', unsafe_allow_html=True)
        with cols[1]:
            st.markdown(f'<div class="stat-card"><div class="stat-number" style="color:#d97706">{len(due)}</div><div class="stat-label">Due for Review</div></div>', unsafe_allow_html=True)

        # Top mistake type
        mistake_counts = {}
        subject_counts = {}
        for e in entries:
            mistake_counts[e["mistake_type"]] = mistake_counts.get(e["mistake_type"], 0) + 1
            subject_counts[e["subject"]] = subject_counts.get(e["subject"], 0) + 1

        if mistake_counts:
            top_mistake = max(mistake_counts, key=mistake_counts.get)
            with cols[2]:
                st.markdown(f'<div class="stat-card"><div style="font-size:14px;font-weight:700">{top_mistake}</div><div class="stat-label">Top Mistake ({mistake_counts[top_mistake]}x)</div></div>', unsafe_allow_html=True)
        if subject_counts:
            top_subject = max(subject_counts, key=subject_counts.get)
            with cols[3]:
                st.markdown(f'<div class="stat-card"><div style="font-size:14px;font-weight:700">{top_subject}</div><div class="stat-label">Weakest Subject ({subject_counts[top_subject]}x)</div></div>', unsafe_allow_html=True)

        # Mistake breakdown
        if len(entries) >= 3:
            st.markdown("#### Mistake Pattern Breakdown")
            sorted_mistakes = sorted(mistake_counts.items(), key=lambda x: x[1], reverse=True)
            for mtype, count in sorted_mistakes:
                pct = count / len(entries)
                col_a, col_b, col_c = st.columns([3, 6, 1])
                with col_a:
                    st.caption(mtype)
                with col_b:
                    st.progress(pct)
                with col_c:
                    st.caption(str(count))

        st.divider()

        # Filters
        col_f1, col_f2, col_f3, col_f4 = st.columns(4)
        with col_f1:
            search = st.text_input("Search", placeholder="Search entries...")
        with col_f2:
            f_subject = st.selectbox("Subject", ["All"] + list(USMLE_SUBJECTS))
        with col_f3:
            f_system = st.selectbox("Organ System", ["All"] + list(ORGAN_SYSTEMS))
        with col_f4:
            f_mistake = st.selectbox("Mistake Type", ["All"] + list(MISTAKE_TYPES))

        # Filter
        filtered = entries
        if f_subject != "All":
            filtered = [e for e in filtered if e["subject"] == f_subject]
        if f_system != "All":
            filtered = [e for e in filtered if e["organ_system"] == f_system]
        if f_mistake != "All":
            filtered = [e for e in filtered if e["mistake_type"] == f_mistake]
        if search:
            q = search.lower()
            filtered = [e for e in filtered if q in " ".join([
                e.get("question_stem", ""), e.get("correct_answer", ""),
                e.get("wrong_answer", ""), e.get("why_i_got_it_wrong", ""),
                e.get("key_learning_point", ""), e.get("mnemonic_or_tip", ""),
                e.get("extracted_text", ""), e.get("subject", ""), e.get("organ_system", ""),
            ]).lower()]

        # Entry cards
        for e in filtered:
            is_due = not e.get("next_review_at") or e["next_review_at"] <= datetime.utcnow().isoformat()
            tags = (
                f'<span class="tag tag-subject">{e["subject"]}</span>'
                f'<span class="tag tag-system">{e["organ_system"]}</span>'
                f'<span class="tag tag-mistake">{e["mistake_type"]}</span>'
            )
            if is_due:
                tags += '<span class="tag tag-due">Due for review</span>'
            title = e.get("title") or ""
            if not title:
                # Generate a title from available content
                kp = e.get("key_learning_point", "")
                qs = e.get("question_stem", "")
                if kp:
                    title = kp[:80] + ("..." if len(kp) > 80 else "")
                elif qs:
                    title = qs[:80] + ("..." if len(qs) > 80 else "")
                else:
                    title = "Untitled Entry"
            summary = e.get("key_learning_point") or e.get("question_stem") or ""
            if summary == title:
                summary = ""
            if len(summary) > 100:
                summary = summary[:100] + "..."
            created = e["created_at"][:10] if e.get("created_at") else ""

            summary_html = f'<div style="margin-top:4px;font-size:0.82rem;color:#64748b;line-height:1.5;">{summary}</div>' if summary else ''
            card_html = (
                f'<div class="entry-card">'
                f'{tags}'
                f'<div style="margin-top:8px;font-size:0.95rem;font-weight:700;color:#f1f5f9;line-height:1.3;">{title}</div>'
                f'{summary_html}'
                f'<div style="margin-top:8px;font-size:0.72rem;color:#94a3b8;">{created} &middot; Reviewed {e.get("review_count", 0)}x</div>'
                f'</div>'
            )
            st.markdown(card_html, unsafe_allow_html=True)

            btn_cols = st.columns([2, 2, 5])
            with btn_cols[0]:
                if st.button("View", key=f"view_{e['id']}", use_container_width=True):
                    go("view", e["id"])
                    st.rerun()
            with btn_cols[1]:
                if st.button("Delete", key=f"del_{e['id']}", use_container_width=True):
                    delete_entry(sb, e["id"])
                    st.rerun()
    else:
        st.markdown("---")
        st.markdown("### Start Your Mistake Notebook")
        st.write("Upload screenshots of UWorld questions you got wrong, log your reasoning errors, and build a personalized review system with spaced repetition.")
        if st.button("Log Your First Mistake", type="primary"):
            go("new")
            st.rerun()


# ===================== NEW / EDIT ENTRY =====================
def render_form(existing=None):
    is_edit = existing is not None
    st.title("Edit Entry" if is_edit else "Log a Mistake")

    if st.button("< Back to Dashboard"):
        go("dashboard")
        st.rerun()

    # Initialize session state for analysis results
    if "analysis_result" not in st.session_state:
        st.session_state.analysis_result = None

    # Paste screenshot from clipboard
    paste_result = paste_image_button("Paste Screenshot from Clipboard", key="paste_img")

    if existing and existing.get("image_url") and paste_result.image_data is None:
        st.image(existing["image_url"], caption="Current screenshot", width=400)

    # OCR only (no auto-analysis yet)
    ocr_text = existing.get("extracted_text", "") if existing else ""

    if paste_result.image_data is not None:
        st.image(paste_result.image_data, caption="Pasted screenshot", width=400)
        # Convert PIL Image to bytes for OCR and upload
        buf = BytesIO()
        paste_result.image_data.save(buf, format="PNG")
        pasted_bytes = buf.getvalue()
        st.session_state.pasted_image_bytes = pasted_bytes

        paste_id = id(paste_result.image_data)
        if st.session_state.get("last_paste_id") != paste_id:
            with st.spinner("Extracting text (OCR)..."):
                ocr_text = extract_text_ocr(pasted_bytes)
                st.session_state.ocr_text = ocr_text
                st.session_state.last_paste_id = paste_id
                st.session_state.analysis_result = None  # reset on new image
        else:
            ocr_text = st.session_state.get("ocr_text", "")

    analysis = st.session_state.analysis_result

    # Merge analysis defaults with existing values
    def default(field, fallback=""):
        if analysis and field in analysis and analysis[field]:
            return analysis[field]
        if existing and field in existing:
            return existing[field]
        return fallback

    def default_select(field, options, fallback=0):
        val = default(field)
        if val in options:
            return options.index(val)
        return fallback

    st.markdown("---")

    # Extracted text
    extracted_text = st.text_area(
        "OCR Extracted Text",
        value=ocr_text or default("extracted_text"),
        height=100,
        help="Raw text extracted from screenshot. You can edit to fix OCR errors.",
    )

    # --- Step 1: User inputs FIRST ---
    st.markdown("### Step 1: Tell me about your mistake")
    st.caption("Fill these in first, then click Analyze to auto-fill the rest.")

    wrong_answer = st.text_area(
        "What I Picked (Wrong Answer)",
        value=default("wrong_answer"),
        height=100,
        placeholder="Which option did you pick? e.g. 'B. Metoprolol — I thought it was a cardioselective beta-blocker issue'",
    )

    why_wrong = st.text_area(
        "Why I Got It Wrong",
        value=default("why_i_got_it_wrong"),
        height=100,
        placeholder="What tripped you up? e.g. 'I confused the mechanism of action with propranolol'",
    )

    mistake_type = st.selectbox(
        "Type of Mistake",
        MISTAKE_TYPES,
        index=default_select("mistake_type", MISTAKE_TYPES),
    )

    # --- Step 2: Analyze button ---
    st.markdown("### Step 2: AI Analysis")

    can_analyze = extracted_text and len(extracted_text.strip()) >= 10
    analyze_clicked = st.button(
        "Analyze with Groq",
        type="primary",
        use_container_width=True,
        disabled=not can_analyze,
        help="Extracts the question, correct answer, key learning points, and study suggestions" if can_analyze else "Upload an image first",
    )

    if analyze_clicked and can_analyze:
        with st.spinner("Analyzing with Groq — auto-filling remaining fields..."):
            result = analyze_with_groq(
                extracted_text,
                wrong_answer=wrong_answer,
                why_wrong=why_wrong,
                mistake_type=mistake_type,
            )
            if result:
                st.session_state.analysis_result = result
                st.success("Analysis complete! Fields auto-filled below.")
                st.rerun()
            else:
                st.warning("Analysis failed. Fill in the fields manually.")

    # --- Step 3: Auto-filled fields (editable) ---
    if analysis:
        st.markdown("### Auto-filled by AI (review & edit)")

    # Classification
    col1, col2 = st.columns(2)
    with col1:
        subject = st.selectbox("Subject", USMLE_SUBJECTS, index=default_select("subject", USMLE_SUBJECTS))
    with col2:
        organ_system = st.selectbox("Organ System", ORGAN_SYSTEMS, index=default_select("organ_system", ORGAN_SYSTEMS))

    title = st.text_input("Title", value=default("title"), placeholder="e.g. Beta-blocker Selectivity in CHF")

    question_stem = st.text_area("Question Stem / Key Info", value=default("question_stem"), height=100)
    correct_answer = st.text_area("Correct Answer", value=default("correct_answer"), height=100)
    key_point = st.text_area("Key Learning Point", value=default("key_learning_point"), height=100)
    mnemonic = st.text_area("Mnemonic / Memory Tip", value=default("mnemonic_or_tip"), height=80)

    # AI suggestions display
    topics = default("topics_to_review", [])
    if isinstance(topics, list) and topics:
        st.markdown('<div class="blue-box"><div class="heading-xs" style="color:#2563eb">Topics to Review</div>', unsafe_allow_html=True)
        for t in topics:
            st.markdown(f"- {t}")
        st.markdown('</div>', unsafe_allow_html=True)

    facts = default("high_yield_facts", [])
    if isinstance(facts, list) and facts:
        st.markdown('<div class="amber-box"><div class="heading-xs" style="color:#d97706">High-Yield Related Facts</div>', unsafe_allow_html=True)
        for f in facts:
            st.markdown(f"- {f}")
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown("---")

    # Save
    if st.button("Update Entry" if is_edit else "Save Entry", type="primary", use_container_width=True):
        sb = get_sb()
        image_url = existing.get("image_url", "") if existing else ""
        pasted_bytes = st.session_state.get("pasted_image_bytes")
        if pasted_bytes:
            with st.spinner("Uploading image..."):
                image_url = upload_image(sb, pasted_bytes, "screenshot.png")

        data = {
            "title": title,
            "image_url": image_url,
            "extracted_text": extracted_text,
            "subject": subject,
            "organ_system": organ_system,
            "mistake_type": mistake_type,
            "question_stem": question_stem,
            "wrong_answer": wrong_answer,
            "correct_answer": correct_answer,
            "why_i_got_it_wrong": why_wrong,
            "key_learning_point": key_point,
            "mnemonic_or_tip": mnemonic,
            "topics_to_review": topics if isinstance(topics, list) else [],
            "high_yield_facts": facts if isinstance(facts, list) else [],
        }

        if is_edit:
            update_entry(sb, existing["id"], data)
            st.success("Entry updated!")
        else:
            data["review_count"] = 0
            data["confidence"] = 1
            data["next_review_at"] = get_next_review_date(0, 1)
            data["user_id"] = st.session_state.get("user_id")
            add_entry(sb, data)
            st.success("Entry saved!")

        # Clear analysis state
        st.session_state.analysis_result = None
        st.session_state.pop("ocr_text", None)
        st.session_state.pop("last_paste_id", None)
        st.session_state.pop("pasted_image_bytes", None)

        go("dashboard")
        st.rerun()


# ===================== VIEW ENTRY =====================
def render_view(entry_id):
    sb = get_sb()
    entry = load_entry(sb, entry_id)
    if not entry:
        st.error("Entry not found.")
        if st.button("Back"):
            go("dashboard")
            st.rerun()
        return

    st.write("")  # spacing so Back button isn't clipped

    col1, col2, col3, col4 = st.columns([3, 2, 2, 5])
    with col1:
        if st.button("< Back"):
            go("dashboard")
            st.rerun()
    with col2:
        if st.button("Edit", use_container_width=True):
            go("edit", entry_id)
            st.rerun()
    with col3:
        if st.button("Delete", use_container_width=True):
            delete_entry(sb, entry_id)
            go("dashboard")
            st.rerun()

    # Tags
    tags = (
        f'<span class="tag tag-subject">{entry["subject"]}</span>'
        f'<span class="tag tag-system">{entry["organ_system"]}</span>'
        f'<span class="tag tag-mistake">{entry["mistake_type"]}</span>'
    )
    st.markdown(tags, unsafe_allow_html=True)

    # Check if needs analysis
    needs_analysis = not entry.get("question_stem") and not entry.get("key_learning_point")

    if needs_analysis and entry.get("extracted_text"):
        st.warning("This entry hasn't been analyzed yet.")
        if st.button("Analyze with Groq", type="primary", use_container_width=True, key="view_analyze"):
            with st.spinner("Analyzing..."):
                result = analyze_with_groq(
                    entry["extracted_text"],
                    wrong_answer=entry.get("wrong_answer", ""),
                    why_wrong=entry.get("why_i_got_it_wrong", ""),
                    mistake_type=entry.get("mistake_type", ""),
                )
                if result:
                    update_data = {}
                    for field in ["title", "subject", "organ_system", "question_stem", "correct_answer",
                                  "why_i_got_it_wrong", "key_learning_point", "mnemonic_or_tip",
                                  "topics_to_review", "high_yield_facts"]:
                        if result.get(field):
                            update_data[field] = result[field]
                    if update_data:
                        update_entry(sb, entry["id"], update_data)
                        st.success("Analysis complete!")
                        st.rerun()
                else:
                    st.error("Analysis failed. Try again later.")

    # Screenshot
    if entry.get("image_url"):
        st.markdown('<div class="section-box">', unsafe_allow_html=True)
        st.markdown('<div class="heading-xs">Screenshot</div>', unsafe_allow_html=True)
        st.image(entry["image_url"], width=600)
        st.markdown('</div>', unsafe_allow_html=True)

    # Question
    if entry.get("question_stem"):
        st.markdown(f'<div class="section-box"><div class="heading-xs">Question Stem</div>{entry["question_stem"]}</div>', unsafe_allow_html=True)
    elif entry.get("extracted_text"):
        st.markdown(f'<div class="section-box"><div class="heading-xs">Captured Text</div><pre style="white-space:pre-wrap;font-size:0.82rem;color:#94a3b8;margin:0;">{entry["extracted_text"][:1000]}</pre></div>', unsafe_allow_html=True)

    # Wrong / Correct
    col_a, col_b = st.columns(2)
    with col_a:
        if entry.get("wrong_answer"):
            st.markdown(f'<div class="red-box"><div class="heading-xs" style="color:#ef4444">What I Picked (Wrong)</div>{entry["wrong_answer"]}</div>', unsafe_allow_html=True)
    with col_b:
        if entry.get("correct_answer"):
            st.markdown(f'<div class="green-box"><div class="heading-xs" style="color:#22c55e">Correct Answer</div>{entry["correct_answer"]}</div>', unsafe_allow_html=True)

    if entry.get("why_i_got_it_wrong"):
        st.markdown(f'<div class="section-box"><div class="heading-xs">Why I Got It Wrong</div>{entry["why_i_got_it_wrong"]}</div>', unsafe_allow_html=True)

    if entry.get("key_learning_point"):
        st.markdown(f'<div class="green-box"><div class="heading-xs" style="color:#16a34a">Key Learning Point</div><strong>{entry["key_learning_point"]}</strong></div>', unsafe_allow_html=True)

    if entry.get("mnemonic_or_tip"):
        st.markdown(f'<div class="amber-box"><div class="heading-xs" style="color:#d97706">Mnemonic / Tip</div>{entry["mnemonic_or_tip"]}</div>', unsafe_allow_html=True)

    # Topics
    if entry.get("topics_to_review") and len(entry["topics_to_review"]) > 0:
        st.markdown('<div class="blue-box"><div class="heading-xs" style="color:#2563eb">Topics to Review</div>', unsafe_allow_html=True)
        for t in entry["topics_to_review"]:
            st.markdown(f"- {t}")
        st.markdown('</div>', unsafe_allow_html=True)

    if entry.get("high_yield_facts") and len(entry["high_yield_facts"]) > 0:
        st.markdown('<div class="purple-box"><div class="heading-xs" style="color:#7c3aed">High-Yield Related Facts</div>', unsafe_allow_html=True)
        for f in entry["high_yield_facts"]:
            st.markdown(f"- {f}")
        st.markdown('</div>', unsafe_allow_html=True)

    # OCR text
    if entry.get("extracted_text"):
        with st.expander("OCR Extracted Text"):
            st.code(entry["extracted_text"], language=None)

    # Flashcards
    st.markdown("---")
    render_flashcards(entry, key_prefix="view")

    # Review tracker
    st.markdown("---")
    st.markdown("#### Review Tracker")
    rc = entry.get("review_count", 0)
    lr = entry.get("last_reviewed_at", "")
    nr = entry.get("next_review_at", "")
    info_parts = [f"Reviewed **{rc}** times"]
    if lr:
        info_parts.append(f"Last: {lr[:10]}")
    if nr:
        is_now = nr <= datetime.utcnow().isoformat()
        info_parts.append(f"Next: {nr[:10]}" + (" **NOW**" if is_now else ""))
    st.write(" · ".join(info_parts))

    st.write("How confident do you feel about this concept now?")
    cols = st.columns(5)
    labels = ["1 - No clue", "2 - Shaky", "3 - Okay", "4 - Good", "5 - Nailed it"]
    for i, col in enumerate(cols):
        conf = i + 1
        with col:
            if st.button(labels[i], key=f"conf_{conf}", use_container_width=True):
                update_entry(sb, entry_id, {
                    "review_count": rc + 1,
                    "last_reviewed_at": datetime.utcnow().isoformat(),
                    "next_review_at": get_next_review_date(rc + 1, conf),
                    "confidence": conf,
                })
                st.success(f"Marked as reviewed with confidence {conf}!")
                st.rerun()

    created = entry.get("created_at", "")[:19]
    updated = entry.get("updated_at", "")[:19]
    st.caption(f"Created {created} · Updated {updated}")


# ===================== REVIEW MODE =====================
def render_review():
    sb = get_sb()
    queue = get_due_for_review(sb)

    if st.button("< Exit Review"):
        go("dashboard")
        st.rerun()

    if not queue:
        st.markdown("### No entries due for review!")
        st.write("Add some mistakes or check back later.")
        return

    idx = st.session_state.review_idx
    if idx >= len(queue):
        idx = len(queue) - 1
        st.session_state.review_idx = idx

    entry = queue[idx]

    # Check if this entry needs analysis (came from extension without Groq)
    needs_analysis = not entry.get("question_stem") and not entry.get("key_learning_point")

    # Navigation: prev / progress / next
    nav1, nav2, nav3 = st.columns([2, 5, 2])
    with nav1:
        if st.button("< Prev", disabled=(idx == 0), use_container_width=True):
            st.session_state.review_idx = idx - 1
            st.session_state.review_show = False
            st.rerun()
    with nav2:
        st.progress((idx + 1) / len(queue), text=f"{idx + 1} / {len(queue)}")
    with nav3:
        if st.button("Next >", disabled=(idx >= len(queue) - 1), use_container_width=True):
            st.session_state.review_idx = idx + 1
            st.session_state.review_show = False
            st.rerun()

    # Title
    title = entry.get("title") or ""
    if title:
        st.markdown(f"### {title}")

    # Tags
    tags = (
        f'<span class="tag tag-subject">{entry["subject"]}</span>'
        f'<span class="tag tag-system">{entry["organ_system"]}</span>'
    )
    st.markdown(tags, unsafe_allow_html=True)

    # Screenshot
    if entry.get("image_url"):
        st.image(entry["image_url"], width=500)

    # Question stem or extracted text fallback
    if entry.get("question_stem"):
        st.markdown(f'<div class="section-box"><div class="heading-xs">Question</div>{entry["question_stem"]}</div>', unsafe_allow_html=True)
    elif entry.get("extracted_text"):
        st.markdown(f'<div class="section-box"><div class="heading-xs">Captured Text</div><pre style="white-space:pre-wrap;font-size:0.82rem;color:#475569;margin:0;">{entry["extracted_text"][:1000]}</pre></div>', unsafe_allow_html=True)

    # If entry hasn't been analyzed yet, offer to analyze
    if needs_analysis and entry.get("extracted_text"):
        st.warning("This entry hasn't been analyzed yet. Run analysis to fill in all fields.")
        if st.button("Analyze Now", type="primary", use_container_width=True, key="rev_analyze"):
            with st.spinner("Analyzing with Groq..."):
                result = analyze_with_groq(
                    entry["extracted_text"],
                    wrong_answer=entry.get("wrong_answer", ""),
                    why_wrong=entry.get("why_i_got_it_wrong", ""),
                    mistake_type=entry.get("mistake_type", ""),
                )
                if result:
                    update_data = {}
                    for field in ["title", "subject", "organ_system", "question_stem", "correct_answer",
                                  "why_i_got_it_wrong", "key_learning_point", "mnemonic_or_tip",
                                  "topics_to_review", "high_yield_facts"]:
                        if result.get(field):
                            update_data[field] = result[field]
                    if update_data:
                        update_entry(sb, entry["id"], update_data)
                        st.success("Analysis complete!")
                        st.rerun()
                else:
                    st.error("Analysis failed. Try again later.")

    # Wrong answer (show even before "Show Answer" so student sees what they picked)
    if entry.get("wrong_answer") and not needs_analysis:
        st.markdown(f'<div class="red-box"><div class="heading-xs" style="color:#ef4444">What I Picked</div>{entry["wrong_answer"]}</div>', unsafe_allow_html=True)

    if not st.session_state.review_show:
        if st.button("Show Answer", type="primary", use_container_width=True):
            st.session_state.review_show = True
            st.rerun()
    else:
        if entry.get("correct_answer"):
            st.markdown(f'<div class="green-box"><div class="heading-xs" style="color:#22c55e">Correct Answer</div>{entry["correct_answer"]}</div>', unsafe_allow_html=True)
        if entry.get("wrong_answer"):
            st.markdown(f'<div class="red-box"><div class="heading-xs" style="color:#ef4444">What I Picked</div>{entry["wrong_answer"]}</div>', unsafe_allow_html=True)
        if entry.get("why_i_got_it_wrong"):
            st.markdown(f'<div class="section-box"><div class="heading-xs">Why I Got It Wrong</div>{entry["why_i_got_it_wrong"]}</div>', unsafe_allow_html=True)
        if entry.get("key_learning_point"):
            st.markdown(f'<div class="green-box"><div class="heading-xs" style="color:#16a34a">Key Learning Point</div><strong>{entry["key_learning_point"]}</strong></div>', unsafe_allow_html=True)
        if entry.get("mnemonic_or_tip"):
            st.markdown(f'<div class="amber-box"><div class="heading-xs" style="color:#d97706">Mnemonic / Tip</div>{entry["mnemonic_or_tip"]}</div>', unsafe_allow_html=True)

        # Topics to review
        if entry.get("topics_to_review") and len(entry["topics_to_review"]) > 0:
            st.markdown('<div class="blue-box"><div class="heading-xs" style="color:#2563eb">Topics to Review</div>', unsafe_allow_html=True)
            for t in entry["topics_to_review"]:
                st.markdown(f"- {t}")
            st.markdown('</div>', unsafe_allow_html=True)

        # Flashcards in review
        st.markdown("---")
        render_flashcards(entry, key_prefix="rev")
        st.markdown("---")

        st.write("How confident do you feel now?")
        cols = st.columns(5)
        labels = ["1 - No clue", "2 - Shaky", "3 - Okay", "4 - Good", "5 - Nailed it"]
        for i, col in enumerate(cols):
            conf = i + 1
            with col:
                if st.button(labels[i], key=f"rev_conf_{conf}", use_container_width=True):
                    rc = entry.get("review_count", 0)
                    update_entry(sb, entry["id"], {
                        "review_count": rc + 1,
                        "last_reviewed_at": datetime.utcnow().isoformat(),
                        "next_review_at": get_next_review_date(rc + 1, conf),
                        "confidence": conf,
                    })
                    st.session_state.review_idx += 1
                    st.session_state.review_show = False
                    st.rerun()


# ===================== ANALYTICS =====================
def render_analytics():
    sb = get_sb()
    entries = load_entries(sb)

    if st.button("< Back to Dashboard"):
        go("dashboard")
        st.rerun()

    st.title("Analytics")

    if len(entries) < 2:
        st.info("Log at least 2 mistakes to see analytics.")
        return

    # ---- WEAKNESS IDENTIFICATION ----
    st.markdown("## Weakness Identification")

    # Subject x Mistake Type heatmap
    st.markdown("#### Subject x Mistake Type Heatmap")
    subjects_in_data = sorted(set(e["subject"] for e in entries))
    mistakes_in_data = sorted(set(e["mistake_type"] for e in entries))
    heatmap_data = []
    for subj in subjects_in_data:
        row = {}
        for mt in mistakes_in_data:
            row[mt] = sum(1 for e in entries if e["subject"] == subj and e["mistake_type"] == mt)
        row["Subject"] = subj
        heatmap_data.append(row)

    import pandas as pd
    df_heat = pd.DataFrame(heatmap_data).set_index("Subject")
    # Show as colored dataframe
    st.dataframe(df_heat, use_container_width=True)

    col1, col2 = st.columns(2)

    # Organ system radar (bar chart as proxy — Streamlit doesn't have native radar)
    with col1:
        st.markdown("#### Mistakes by Organ System")
        system_counts = Counter(e["organ_system"] for e in entries)
        df_sys = pd.DataFrame(
            sorted(system_counts.items(), key=lambda x: x[1], reverse=True),
            columns=["Organ System", "Mistakes"],
        )
        st.bar_chart(df_sys.set_index("Organ System"))

    # Lowest confidence entries
    with col2:
        st.markdown("#### Lowest Confidence Entries")
        reviewed = [e for e in entries if e.get("review_count", 0) > 0]
        if reviewed:
            low_conf = sorted(reviewed, key=lambda e: (e.get("confidence", 1), -e.get("review_count", 0)))[:5]
            for e in low_conf:
                label = e.get("key_learning_point") or e.get("question_stem") or "No notes"
                conf = e.get("confidence", 1)
                reviews = e.get("review_count", 0)
                st.markdown(
                    f'<div class="section-box">'
                    f'<span class="tag tag-subject">{e["subject"]}</span>'
                    f'<span class="tag tag-mistake">{e["mistake_type"]}</span><br>'
                    f'<small>{label[:80]}{"..." if len(label) > 80 else ""}</small><br>'
                    f'<small>Confidence: <strong>{conf}/5</strong> · Reviewed {reviews}x</small>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
        else:
            st.caption("No reviewed entries yet.")

    st.divider()

    # ---- PROGRESS TRACKING ----
    st.markdown("## Progress Tracking")

    # Mistakes over time
    st.markdown("#### Mistakes Logged Over Time")
    dates = [e["created_at"][:10] for e in entries if e.get("created_at")]
    date_counts = Counter(dates)
    if date_counts:
        all_dates = sorted(date_counts.keys())
        # Accumulate by week
        df_time = pd.DataFrame({"Date": all_dates, "Count": [date_counts[d] for d in all_dates]})
        df_time["Date"] = pd.to_datetime(df_time["Date"])
        df_weekly = df_time.set_index("Date").resample("W").sum()
        if len(df_weekly) > 1:
            st.line_chart(df_weekly)
        else:
            st.bar_chart(df_time.set_index("Date"))

    # Confidence trend over reviews
    st.markdown("#### Confidence Trend Over Reviews")
    reviewed_with_date = [
        e for e in entries
        if e.get("last_reviewed_at") and e.get("confidence")
    ]
    if reviewed_with_date:
        rev_sorted = sorted(reviewed_with_date, key=lambda e: e["last_reviewed_at"])
        df_conf = pd.DataFrame({
            "Date": pd.to_datetime([e["last_reviewed_at"][:10] for e in rev_sorted]),
            "Confidence": [e["confidence"] for e in rev_sorted],
        })
        df_conf_avg = df_conf.set_index("Date").resample("W").mean()
        if len(df_conf_avg.dropna()) > 1:
            st.line_chart(df_conf_avg)
        else:
            avg = sum(e["confidence"] for e in rev_sorted) / len(rev_sorted)
            st.metric("Average Confidence", f"{avg:.1f} / 5")
    else:
        st.caption("No reviews yet.")

    # Review compliance
    st.markdown("#### Review Compliance")
    total_due_ever = len([e for e in entries if e.get("review_count", 0) > 0 or e.get("next_review_at")])
    total_reviewed = len([e for e in entries if e.get("review_count", 0) > 0])
    due_now = len(get_due_for_review(sb))

    c1, c2, c3 = st.columns(3)
    with c1:
        st.metric("Entries Reviewed At Least Once", f"{total_reviewed}/{len(entries)}")
    with c2:
        if total_due_ever > 0:
            compliance = total_reviewed / total_due_ever * 100
            st.metric("Review Rate", f"{compliance:.0f}%")
        else:
            st.metric("Review Rate", "N/A")
    with c3:
        st.metric("Currently Due", str(due_now))

    st.divider()

    # ---- PATTERN ANALYSIS ----
    st.markdown("## Pattern Analysis")

    # Mistake type breakdown by subject
    st.markdown("#### Mistake Types by Subject")
    for subj in subjects_in_data:
        subj_entries = [e for e in entries if e["subject"] == subj]
        if not subj_entries:
            continue
        mt_counts = Counter(e["mistake_type"] for e in subj_entries)
        st.markdown(f"**{subj}** ({len(subj_entries)} mistakes)")
        for mt, count in sorted(mt_counts.items(), key=lambda x: x[1], reverse=True):
            pct = count / len(subj_entries)
            col_a, col_b, col_c = st.columns([3, 6, 1])
            with col_a:
                st.caption(mt)
            with col_b:
                st.progress(pct)
            with col_c:
                st.caption(str(count))

    # Time to mastery
    st.markdown("#### Time to Mastery")
    st.caption("Average reviews needed to reach confidence 4+ by subject")
    mastered = [e for e in entries if e.get("confidence", 0) >= 4 and e.get("review_count", 0) > 0]
    if mastered:
        mastery_by_subj = defaultdict(list)
        for e in mastered:
            mastery_by_subj[e["subject"]].append(e["review_count"])
        mastery_data = []
        for subj, counts in sorted(mastery_by_subj.items()):
            avg = sum(counts) / len(counts)
            mastery_data.append({"Subject": subj, "Avg Reviews to Mastery": round(avg, 1), "Entries": len(counts)})
        df_mastery = pd.DataFrame(mastery_data)
        st.dataframe(df_mastery, use_container_width=True, hide_index=True)
    else:
        st.caption("No entries have reached confidence 4+ yet.")

    # Repeat offenders
    st.markdown("#### Repeat Offenders")
    st.caption("Reviewed 3+ times but still low confidence")
    repeat = [
        e for e in entries
        if e.get("review_count", 0) >= 3 and e.get("confidence", 1) < 4
    ]
    if repeat:
        repeat = sorted(repeat, key=lambda e: (-e.get("review_count", 0), e.get("confidence", 1)))
        for e in repeat:
            label = e.get("key_learning_point") or e.get("question_stem") or "No notes"
            st.markdown(
                f'<div class="red-box">'
                f'<span class="tag tag-subject">{e["subject"]}</span>'
                f'<span class="tag tag-system">{e["organ_system"]}</span><br>'
                f'<strong>{label[:100]}{"..." if len(label) > 100 else ""}</strong><br>'
                f'<small>Reviewed <strong>{e["review_count"]}x</strong> · '
                f'Confidence: <strong>{e.get("confidence", 1)}/5</strong></small>'
                f'</div>',
                unsafe_allow_html=True,
            )
    else:
        st.caption("No repeat offenders — keep it up!")

    st.divider()

    # ---- STUDY PLANNING ----
    st.markdown("## Study Planning")

    # Priority score: weighted combo of mistake count, low confidence, overdue reviews
    st.markdown("#### Suggested Study Priorities")
    st.caption("Weighted by mistake frequency, low confidence, and overdue reviews")
    now = datetime.utcnow().isoformat()
    subject_scores = defaultdict(lambda: {"mistakes": 0, "low_conf": 0, "overdue": 0, "total_conf": 0, "count": 0})
    for e in entries:
        s = e["subject"]
        subject_scores[s]["mistakes"] += 1
        subject_scores[s]["total_conf"] += e.get("confidence", 1)
        subject_scores[s]["count"] += 1
        if e.get("confidence", 1) < 3:
            subject_scores[s]["low_conf"] += 1
        if not e.get("next_review_at") or e["next_review_at"] <= now:
            subject_scores[s]["overdue"] += 1

    priority_data = []
    for subj, scores in subject_scores.items():
        avg_conf = scores["total_conf"] / scores["count"] if scores["count"] else 0
        # Higher score = needs more attention
        priority = (scores["mistakes"] * 1.0) + (scores["low_conf"] * 2.0) + (scores["overdue"] * 1.5)
        priority_data.append({
            "Subject": subj,
            "Mistakes": scores["mistakes"],
            "Low Confidence": scores["low_conf"],
            "Overdue": scores["overdue"],
            "Avg Confidence": round(avg_conf, 1),
            "Priority Score": round(priority, 1),
        })

    priority_data.sort(key=lambda x: x["Priority Score"], reverse=True)
    df_priority = pd.DataFrame(priority_data)
    st.dataframe(df_priority, use_container_width=True, hide_index=True)

    # Exam readiness by organ system
    st.markdown("#### Exam Readiness by Organ System")
    st.caption("Green = strong, Yellow = needs work, Red = weak")
    system_scores = defaultdict(lambda: {"total_conf": 0, "count": 0, "mistakes": 0})
    for e in entries:
        os_ = e["organ_system"]
        system_scores[os_]["mistakes"] += 1
        system_scores[os_]["total_conf"] += e.get("confidence", 1)
        system_scores[os_]["count"] += 1

    readiness_data = []
    for sys_name, scores in system_scores.items():
        avg_conf = scores["total_conf"] / scores["count"] if scores["count"] else 0
        readiness_data.append({
            "Organ System": sys_name,
            "Mistakes": scores["mistakes"],
            "Avg Confidence": round(avg_conf, 1),
        })
    readiness_data.sort(key=lambda x: x["Avg Confidence"])

    for item in readiness_data:
        conf = item["Avg Confidence"]
        if conf >= 4:
            box_class = "green-box"
            status = "Strong"
        elif conf >= 2.5:
            box_class = "amber-box"
            status = "Needs Work"
        else:
            box_class = "red-box"
            status = "Weak"
        st.markdown(
            f'<div class="{box_class}">'
            f'<strong>{item["Organ System"]}</strong> — {status}<br>'
            f'<small>{item["Mistakes"]} mistakes · Avg confidence: {conf}/5</small>'
            f'</div>',
            unsafe_allow_html=True,
        )


# ===================== ROUTER =====================
if not is_logged_in():
    render_login()
else:
    # Sidebar navigation
    with st.sidebar:
        st.markdown(f"**{st.session_state.get('user_email', '')}**")
        nav = sac.menu([
            sac.MenuItem("Dashboard", icon="house"),
            sac.MenuItem("Log Mistake", icon="plus-circle"),
            sac.MenuItem("Review", icon="clock-history"),
            sac.MenuItem("Analytics", icon="bar-chart-line"),
            sac.MenuItem(type="divider"),
            sac.MenuItem("Log Out", icon="box-arrow-right"),
        ], open_all=True, index=0)

        if nav == "Log Out":
            logout()
        elif nav == "Dashboard" and st.session_state.page not in ("view", "edit"):
            st.session_state.page = "dashboard"
        elif nav == "Log Mistake" and st.session_state.page != "new":
            st.session_state.page = "new"
        elif nav == "Review" and st.session_state.page != "review":
            st.session_state.page = "review"
            st.session_state.review_idx = 0
            st.session_state.review_show = False
        elif nav == "Analytics" and st.session_state.page != "analytics":
            st.session_state.page = "analytics"

    page = st.session_state.page

    if page == "dashboard":
        render_dashboard()
    elif page == "new":
        render_form()
    elif page == "edit":
        sb = get_sb()
        entry = load_entry(sb, st.session_state.view_id) if st.session_state.view_id else None
        render_form(existing=entry)
    elif page == "view":
        render_view(st.session_state.view_id)
    elif page == "analytics":
        render_analytics()
    elif page == "review":
        render_review()
