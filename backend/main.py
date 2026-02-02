import logging
import os

from fastapi import FastAPI, HTTPException
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

# Lazily initialised so module import doesn't fail without the key
_openai_client: OpenAI | None = None


def get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI()
    return _openai_client


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/chat")
def chat(req: ChatRequest):
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
    return {"message": "API running"}