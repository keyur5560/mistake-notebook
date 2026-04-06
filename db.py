import os
import uuid
from datetime import datetime, timedelta
from supabase import create_client, Client

INTERVALS = [1, 3, 7, 14, 30, 60]

USMLE_SUBJECTS = [
    "Anatomy", "Biochemistry", "Biostatistics & Epidemiology",
    "Behavioral Science", "Immunology", "Microbiology",
    "Pathology", "Pharmacology", "Physiology",
]

ORGAN_SYSTEMS = [
    "Cardiovascular", "Endocrine", "Gastrointestinal",
    "Hematology & Oncology", "Musculoskeletal", "Neurology & Psychiatry",
    "Renal", "Reproductive", "Respiratory", "Multisystem & General",
]

MISTAKE_TYPES = [
    "Misread the question", "Didn't know the concept",
    "Knew it but picked wrong answer", "Narrowed to 2, picked wrong one",
    "Overthought it", "Careless error", "Ran out of time", "Other",
]


def get_supabase() -> Client:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    return create_client(url, key)


def get_authed_supabase(access_token: str) -> Client:
    """Create a Supabase client authenticated with the user's access token."""
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    sb = create_client(url, key)
    sb.postgrest.auth(access_token)
    return sb


def get_next_review_date(review_count: int, confidence: int) -> str:
    idx = min(review_count, len(INTERVALS) - 1)
    if confidence >= 4:
        multiplier = 1.5
    elif confidence >= 3:
        multiplier = 1.0
    else:
        multiplier = 0.5
    days = round(INTERVALS[idx] * multiplier)
    return (datetime.utcnow() + timedelta(days=days)).isoformat()


def upload_image(sb: Client, file_bytes: bytes, filename: str) -> str:
    """Upload image to Supabase Storage, return public URL."""
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "png"
    storage_name = f"{uuid.uuid4()}.{ext}"

    sb.storage.from_("screenshots").upload(
        storage_name, file_bytes, {"content-type": f"image/{ext}"}
    )

    res = sb.storage.from_("screenshots").get_public_url(storage_name)
    return res


def delete_image(sb: Client, image_url: str):
    if not image_url:
        return
    parts = image_url.split("/screenshots/")
    if len(parts) < 2:
        return
    sb.storage.from_("screenshots").remove([parts[1]])


def row_to_dict(row: dict) -> dict:
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "user_id": row.get("user_id", ""),
        "image_url": row.get("image_url", ""),
        "extracted_text": row.get("extracted_text", ""),
        "subject": row["subject"],
        "organ_system": row["organ_system"],
        "mistake_type": row["mistake_type"],
        "question_stem": row.get("question_stem", ""),
        "wrong_answer": row.get("wrong_answer", ""),
        "correct_answer": row.get("correct_answer", ""),
        "why_i_got_it_wrong": row.get("why_i_got_it_wrong", ""),
        "key_learning_point": row.get("key_learning_point", ""),
        "mnemonic_or_tip": row.get("mnemonic_or_tip", ""),
        "topics_to_review": row.get("topics_to_review", []),
        "high_yield_facts": row.get("high_yield_facts", []),
        "review_count": row.get("review_count", 0),
        "last_reviewed_at": row.get("last_reviewed_at"),
        "next_review_at": row.get("next_review_at"),
        "confidence": row.get("confidence", 1),
    }


def load_entries(sb: Client) -> list[dict]:
    res = sb.table("mistakes").select("*").order("created_at", desc=True).execute()
    return [row_to_dict(r) for r in res.data]


def load_entry(sb: Client, entry_id: str) -> dict | None:
    res = sb.table("mistakes").select("*").eq("id", entry_id).execute()
    if res.data:
        return row_to_dict(res.data[0])
    return None


def add_entry(sb: Client, data: dict) -> dict | None:
    res = sb.table("mistakes").insert(data).execute()
    if res.data:
        return row_to_dict(res.data[0])
    return None


def update_entry(sb: Client, entry_id: str, data: dict) -> dict | None:
    data["updated_at"] = datetime.utcnow().isoformat()
    res = sb.table("mistakes").update(data).eq("id", entry_id).execute()
    if res.data:
        return row_to_dict(res.data[0])
    return None


def delete_entry(sb: Client, entry_id: str):
    entry = load_entry(sb, entry_id)
    if entry and entry.get("image_url"):
        delete_image(sb, entry["image_url"])
    sb.table("mistakes").delete().eq("id", entry_id).execute()


def get_due_for_review(sb: Client) -> list[dict]:
    now = datetime.utcnow().isoformat()
    res = (
        sb.table("mistakes")
        .select("*")
        .or_(f"next_review_at.is.null,next_review_at.lte.{now}")
        .order("next_review_at")
        .execute()
    )
    return [row_to_dict(r) for r in res.data]
