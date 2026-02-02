import logging
import os
import time
from collections import defaultdict

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from openai import OpenAI

logger = logging.getLogger(__name__)

app = FastAPI()

# Allow your mobile app to call this API (simple dev setup)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev only — restrict in production
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Simple in-memory sliding-window rate limiter
# ---------------------------------------------------------------------------
_rate_buckets: dict[str, list[float]] = defaultdict(list)

RATE_LIMITS: dict[str, tuple[int, int]] = {
    # key_prefix: (max_requests, window_seconds)
    "chat": (10, 60),
}


def _check_rate_limit(client_ip: str, bucket: str) -> None:
    max_req, window = RATE_LIMITS[bucket]
    key = f"{bucket}:{client_ip}"
    now = time.monotonic()
    timestamps = _rate_buckets[key]
    # Prune entries outside the window
    _rate_buckets[key] = [t for t in timestamps if now - t < window]
    if len(_rate_buckets[key]) >= max_req:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again shortly.")
    _rate_buckets[key].append(now)

# Lazily initialised so module import doesn't fail without the key
_openai_client: OpenAI | None = None


def get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI()
    return _openai_client


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1500)


@app.get("/health")
def health():
    return {"ok": True}


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.post("/chat")
def chat(req: ChatRequest, request: Request):
    _check_rate_limit(_get_client_ip(request), "chat")

    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set on the server")

    system_prompt = """
You are a Gym Workout Tracker AI.

Rules:
- Interpret short, messy gym messages.
- Infer missing exercise names from context.
- Auto-increment set numbers per exercise.
- Convert all weights to numeric pounds.
- Never explain reasoning.
- Output structured workout log rows only.
- Treat this as a memory layer, not a coach.
"""

    try:
        resp = get_openai_client().responses.create(
            model="gpt-4o-mini",
            input=[
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": req.message
                }
            ],
        )

        return {"reply": resp.output_text}

    except Exception:
        logger.exception("OpenAI request failed")
        raise HTTPException(status_code=500, detail="OpenAI request failed")


@app.get("/")
def root():
    return {"message": "Coach Kettle API running"}