#!/bin/bash

# Navigate to backend directory
cd backend

# Check if virtual environment exists and activate it
if [ -d ".venv" ]; then
    source .venv/bin/activate
    echo "Activated .venv"
else
    echo "Warning: .venv not found. Running with system python/uvicorn..."
fi

# Run the server
# --reload enables auto-reload on code changes
# --host 0.0.0.0 makes it accessible on LAN (needed for phone/simulator)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
