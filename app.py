import streamlit as st
from datetime import datetime
from db import (
    load_entries, load_entry, add_entry, update_entry, delete_entry,
    get_due_for_review, upload_image, get_next_review_date,
    USMLE_SUBJECTS, ORGAN_SYSTEMS, MISTAKE_TYPES,
)
from analyze import extract_text_ocr, analyze_with_groq

st.set_page_config(
    page_title="Mistake Notebook — USMLE Step 1",
    page_icon="📝",
    layout="wide",
)

# --- Custom CSS ---
st.markdown("""
<style>
    .stApp { max-width: 1100px; margin: 0 auto; }
    .stat-card {
        background: white; border: 1px solid #e2e8f0; border-radius: 12px;
        padding: 16px; text-align: center;
    }
    .stat-number { font-size: 28px; font-weight: 700; }
    .stat-label { font-size: 12px; color: #64748b; }
    .tag {
        display: inline-block; padding: 2px 10px; border-radius: 999px;
        font-size: 12px; font-weight: 600; margin-right: 6px; margin-bottom: 4px;
    }
    .tag-subject { background: #dbeafe; color: #1e40af; }
    .tag-system { background: #ccfbf1; color: #115e59; }
    .tag-mistake { background: #fee2e2; color: #991b1b; }
    .tag-due { background: #fef3c7; color: #92400e; }
    .section-box {
        background: white; border: 1px solid #e2e8f0; border-radius: 12px;
        padding: 20px; margin-bottom: 12px;
    }
    .green-box {
        background: #f0fdf4; border: 1px solid #86efac; border-radius: 12px;
        padding: 20px; margin-bottom: 12px;
    }
    .amber-box {
        background: #fffbeb; border: 1px solid #fcd34d; border-radius: 12px;
        padding: 20px; margin-bottom: 12px;
    }
    .blue-box {
        background: #eff6ff; border: 1px solid #93c5fd; border-radius: 12px;
        padding: 20px; margin-bottom: 12px;
    }
    .purple-box {
        background: #faf5ff; border: 1px solid #c4b5fd; border-radius: 12px;
        padding: 20px; margin-bottom: 12px;
    }
    .red-box {
        background: #fef2f2; border: 1px solid #fca5a5; border-radius: 12px;
        padding: 20px; margin-bottom: 12px;
    }
    .heading-xs {
        font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 8px;
    }
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


# ===================== DASHBOARD =====================
def render_dashboard():
    entries = load_entries()
    due = get_due_for_review()

    col1, col2 = st.columns([3, 1])
    with col1:
        st.title("Mistake Notebook")
        st.caption(f"USMLE Step 1 · {len(entries)} entries logged")
    with col2:
        st.write("")
        c1, c2 = st.columns(2)
        with c1:
            if len(due) > 0:
                if st.button(f"Review ({len(due)})", type="secondary", use_container_width=True):
                    go("review")
                    st.rerun()
        with c2:
            if st.button("+ Log Mistake", type="primary", use_container_width=True):
                go("new")
                st.rerun()

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
            with st.container():
                cols = st.columns([1, 5, 2])
                with cols[0]:
                    if e.get("image_url"):
                        st.image(e["image_url"], width=100)
                with cols[1]:
                    tags = (
                        f'<span class="tag tag-subject">{e["subject"]}</span>'
                        f'<span class="tag tag-system">{e["organ_system"]}</span>'
                        f'<span class="tag tag-mistake">{e["mistake_type"]}</span>'
                    )
                    if is_due:
                        tags += '<span class="tag tag-due">Due for review</span>'
                    st.markdown(tags, unsafe_allow_html=True)
                    st.write(e.get("key_learning_point") or e.get("question_stem") or "No notes yet")
                    created = e["created_at"][:10] if e.get("created_at") else ""
                    st.caption(f"{created} · Reviewed {e.get('review_count', 0)}x")
                with cols[2]:
                    st.write("")
                    c1, c2 = st.columns(2)
                    with c1:
                        if st.button("View", key=f"view_{e['id']}", use_container_width=True):
                            go("view", e["id"])
                            st.rerun()
                    with c2:
                        if st.button("Delete", key=f"del_{e['id']}", use_container_width=True):
                            delete_entry(e["id"])
                            st.rerun()
                st.divider()
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

    # Image upload
    uploaded = st.file_uploader("Upload Screenshot", type=["png", "jpg", "jpeg", "webp"])

    if existing and existing.get("image_url") and not uploaded:
        st.image(existing["image_url"], caption="Current screenshot", width=400)

    # OCR only (no auto-analysis yet)
    ocr_text = existing.get("extracted_text", "") if existing else ""

    if uploaded:
        st.image(uploaded, caption="Uploaded screenshot", width=400)
        if "last_ocr_file" not in st.session_state or st.session_state.last_ocr_file != uploaded.name:
            with st.spinner("Extracting text (OCR)..."):
                ocr_text = extract_text_ocr(uploaded.getvalue())
                st.session_state.ocr_text = ocr_text
                st.session_state.last_ocr_file = uploaded.name
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
        image_url = existing.get("image_url", "") if existing else ""
        if uploaded:
            with st.spinner("Uploading image..."):
                image_url = upload_image(uploaded.getvalue(), uploaded.name)

        data = {
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
            update_entry(existing["id"], data)
            st.success("Entry updated!")
        else:
            data["review_count"] = 0
            data["confidence"] = 1
            data["next_review_at"] = get_next_review_date(0, 1)
            add_entry(data)
            st.success("Entry saved!")

        # Clear analysis state
        st.session_state.analysis_result = None
        st.session_state.pop("ocr_text", None)
        st.session_state.pop("last_ocr_file", None)

        go("dashboard")
        st.rerun()


# ===================== VIEW ENTRY =====================
def render_view(entry_id):
    entry = load_entry(entry_id)
    if not entry:
        st.error("Entry not found.")
        if st.button("Back"):
            go("dashboard")
            st.rerun()
        return

    col1, col2 = st.columns([3, 1])
    with col1:
        if st.button("< Back"):
            go("dashboard")
            st.rerun()
    with col2:
        c1, c2 = st.columns(2)
        with c1:
            if st.button("Edit", use_container_width=True):
                go("edit", entry_id)
                st.rerun()
        with c2:
            if st.button("Delete", use_container_width=True):
                delete_entry(entry_id)
                go("dashboard")
                st.rerun()

    # Tags
    tags = (
        f'<span class="tag tag-subject">{entry["subject"]}</span>'
        f'<span class="tag tag-system">{entry["organ_system"]}</span>'
        f'<span class="tag tag-mistake">{entry["mistake_type"]}</span>'
    )
    st.markdown(tags, unsafe_allow_html=True)

    # Screenshot
    if entry.get("image_url"):
        st.markdown('<div class="section-box">', unsafe_allow_html=True)
        st.markdown('<div class="heading-xs">Screenshot</div>', unsafe_allow_html=True)
        st.image(entry["image_url"], width=600)
        st.markdown('</div>', unsafe_allow_html=True)

    # Question
    if entry.get("question_stem"):
        st.markdown(f'<div class="section-box"><div class="heading-xs">Question Stem</div>{entry["question_stem"]}</div>', unsafe_allow_html=True)

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
                update_entry(entry_id, {
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
    queue = get_due_for_review()

    if st.button("< Exit Review"):
        go("dashboard")
        st.rerun()

    if not queue:
        st.markdown("### No entries due for review!")
        st.write("Add some mistakes or check back later.")
        return

    idx = st.session_state.review_idx
    if idx >= len(queue):
        st.markdown("### Review complete!")
        st.write(f"{len(queue)} entries reviewed. Great work!")
        if st.button("Back to Dashboard", type="primary"):
            go("dashboard")
            st.rerun()
        return

    entry = queue[idx]

    # Progress
    st.progress((idx + 1) / len(queue), text=f"{idx + 1} / {len(queue)}")

    # Tags
    tags = (
        f'<span class="tag tag-subject">{entry["subject"]}</span>'
        f'<span class="tag tag-system">{entry["organ_system"]}</span>'
    )
    st.markdown(tags, unsafe_allow_html=True)

    if entry.get("image_url"):
        st.image(entry["image_url"], width=500)

    if entry.get("question_stem"):
        st.markdown(f'<div class="section-box"><div class="heading-xs">Question</div>{entry["question_stem"]}</div>', unsafe_allow_html=True)

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

        st.write("How confident do you feel now?")
        cols = st.columns(5)
        labels = ["1 - No clue", "2 - Shaky", "3 - Okay", "4 - Good", "5 - Nailed it"]
        for i, col in enumerate(cols):
            conf = i + 1
            with col:
                if st.button(labels[i], key=f"rev_conf_{conf}", use_container_width=True):
                    rc = entry.get("review_count", 0)
                    update_entry(entry["id"], {
                        "review_count": rc + 1,
                        "last_reviewed_at": datetime.utcnow().isoformat(),
                        "next_review_at": get_next_review_date(rc + 1, conf),
                        "confidence": conf,
                    })
                    st.session_state.review_idx += 1
                    st.session_state.review_show = False
                    st.rerun()


# ===================== ROUTER =====================
page = st.session_state.page

if page == "dashboard":
    render_dashboard()
elif page == "new":
    render_form()
elif page == "edit":
    entry = load_entry(st.session_state.view_id) if st.session_state.view_id else None
    render_form(existing=entry)
elif page == "view":
    render_view(st.session_state.view_id)
elif page == "review":
    render_review()
