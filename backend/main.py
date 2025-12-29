import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import sqlite3

# Load .env file from project root
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)
print(f"[STARTUP] Loaded .env from {env_path}")
print(f"[STARTUP] OPENAI_API_KEY set: {'Yes' if os.getenv('OPENAI_API_KEY') else 'No'}")

app = FastAPI()

# Allow all origins in development (needed for Expo Go on physical device)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenAI client reads OPENAI_API_KEY from environment
client = OpenAI()

# Database setup
DB_PATH = Path(__file__).parent / "workouts.db"


def init_db():
    """Initialize the database with workout_log table"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS workout_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workout_id TEXT NOT NULL,
            workout_date TEXT NOT NULL,
            exercise TEXT NOT NULL,
            set_number REAL NOT NULL,
            weight_lbs TEXT,
            reps TEXT,
            notes TEXT,
            created_at TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_workout_id ON workout_log(workout_id)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_workout_date ON workout_log(workout_date)
    """)
    conn.commit()
    conn.close()


# Initialize database on startup
init_db()


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


class WorkoutSession(BaseModel):
    id: str
    dateISO: str
    part: str
    rows: list[WorkoutRow]
    createdAt: int


class SaveWorkoutRequest(BaseModel):
    workout: WorkoutSession


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/chat")
def chat(req: ChatRequest):
    print(f"[DEBUG] /chat called with message: {req.message[:50]}...")
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[ERROR] OPENAI_API_KEY is not set")
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set on the server")
    
    print(f"[DEBUG] API key found (starts with {api_key[:10]}...)")

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
        
        print(f"[DEBUG] Calling OpenAI with context: {json.dumps(context)[:200]}...")

        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(context)},
            ],
            response_format={"type": "json_object"},
        )

        content = resp.choices[0].message.content
        print(f"[DEBUG] OpenAI response: {content}")
        
        if not content:
            raise HTTPException(status_code=500, detail="Model did not return content")

        parsed_data = json.loads(content)
        # Validate and return the response
        response = ChatResponse(**parsed_data)
        print(f"[SUCCESS] Returning {len(response.rows)} rows")
        return response.model_dump()

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] OpenAI request failed: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"OpenAI request failed: {str(e)}")


@app.post("/workouts/save")
def save_workout(req: SaveWorkoutRequest):
    """Save a workout session with all its rows to the database"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        workout = req.workout
        created_at = datetime.fromtimestamp(workout.createdAt / 1000).isoformat()
        
        print(f"[DEBUG] Saving workout: id={workout.id}, date={workout.dateISO}, rows={len(workout.rows)}")
        
        # Insert each row
        rows_saved = 0
        for row in workout.rows:
            try:
                cursor.execute("""
                    INSERT INTO workout_log 
                    (workout_id, workout_date, exercise, set_number, weight_lbs, reps, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    workout.id,
                    workout.dateISO,
                    row.exercise,
                    float(row.set) if isinstance(row.set, (int, float)) else 1.0,
                    row.weightLbs or "",
                    row.reps or "",
                    row.notes or "",
                    created_at
                ))
                rows_saved += 1
            except Exception as row_error:
                print(f"[ERROR] Failed to insert row: {row_error}")
                raise
        
        conn.commit()
        conn.close()
        
        print(f"[SUCCESS] Saved workout {workout.id} with {rows_saved} rows")
        return {"success": True, "workout_id": workout.id, "rows_saved": rows_saved}
    
    except Exception as e:
        print(f"[ERROR] Failed to save workout: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save workout: {str(e)}")


@app.get("/workouts")
def list_workouts(date: Optional[str] = None):
    """List all workouts, optionally filtered by date"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        if date:
            cursor.execute("""
                SELECT DISTINCT workout_id, workout_date, MIN(created_at) as created_at
                FROM workout_log
                WHERE workout_date = ?
                GROUP BY workout_id, workout_date
                ORDER BY created_at DESC
            """, (date,))
        else:
            cursor.execute("""
                SELECT DISTINCT workout_id, workout_date, MIN(created_at) as created_at
                FROM workout_log
                GROUP BY workout_id, workout_date
                ORDER BY created_at DESC
            """)
        
        workouts = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        return {"workouts": workouts}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list workouts: {str(e)}")


@app.get("/workouts/{workout_id}")
def get_workout(workout_id: str):
    """Get a specific workout with all its rows"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get workout metadata
        cursor.execute("""
            SELECT DISTINCT workout_id, workout_date, MIN(created_at) as created_at
            FROM workout_log
            WHERE workout_id = ?
            GROUP BY workout_id, workout_date
        """, (workout_id,))
        
        meta = cursor.fetchone()
        if not meta:
            raise HTTPException(status_code=404, detail="Workout not found")
        
        # Get all rows for this workout
        cursor.execute("""
            SELECT exercise, set_number, weight_lbs, reps, notes
            FROM workout_log
            WHERE workout_id = ?
            ORDER BY set_number, created_at
        """, (workout_id,))
        
        rows = []
        for row in cursor.fetchall():
            set_num = float(row["set_number"])
            rows.append({
                "exercise": row["exercise"],
                "set": int(set_num) if set_num.is_integer() else set_num,
                "weightLbs": row["weight_lbs"] or "",
                "reps": row["reps"] or "",
                "notes": row["notes"] or ""
            })
        
        conn.close()
        
        return {
            "id": meta["workout_id"],
            "dateISO": meta["workout_date"],
            "rows": rows,
            "createdAt": int(datetime.fromisoformat(meta["created_at"]).timestamp() * 1000)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get workout: {str(e)}")


@app.delete("/workouts/{workout_id}")
def delete_workout(workout_id: str):
    """Delete a workout and all its rows"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("DELETE FROM workout_log WHERE workout_id = ?", (workout_id,))
        deleted = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        return {"success": True, "deleted_rows": deleted}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete workout: {str(e)}")


@app.get("/")
def root():
    return {"message": "API running"}
