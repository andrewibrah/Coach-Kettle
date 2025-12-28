import json
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

app = FastAPI()

# Allow Expo dev origins; keep explicit (no wildcard) by default.
cors_env = os.getenv("CORS_ORIGINS", "").strip()
allow_origins = (
    [origin.strip() for origin in cors_env.split(",") if origin.strip()]
    if cors_env
    else [
        "http://localhost:19006",
        "http://127.0.0.1:19006",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
    ]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenAI client reads OPENAI_API_KEY from environment
client = OpenAI()


class WorkoutRow(BaseModel):
    exercise: str
    set: int
    weightLbs: str
    reps: str
    notes: str


class ChatRequest(BaseModel):
    message: str
    rows: list[WorkoutRow] = []


class ChatResponse(BaseModel):
    rows: list[WorkoutRow]


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/chat")
def chat(req: ChatRequest):
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set on the server")

    system_prompt = """
You are a Gym Workout Tracker parser.

Return a JSON object with a single key "rows" containing an array of workout rows.
Each row must include: exercise (string), set (integer), weightLbs (string), reps (string), notes (string).
If a field is missing, return an empty string.
If weights are mentioned, convert to numeric pounds with no units.
Set numbers must auto-increment per exercise based on existing rows provided.
Return only new rows inferred from the message.
Do not include extra keys, text, or markdown.
"""

    try:
        context = {
            "message": req.message,
            "existing_rows": [row.model_dump() for row in req.rows],
        }

        resp = client.responses.parse(
            model="gpt-4o-mini",
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(context)},
            ],
            text_format=ChatResponse,
        )

        parsed = resp.output_parsed
        if parsed is None:
            raise HTTPException(status_code=500, detail="Model did not return structured output")

        return parsed.model_dump()

    except Exception:
        raise HTTPException(status_code=500, detail="OpenAI request failed")


@app.get("/")
def root():
    return {"message": "API running"}
