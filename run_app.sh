#!/bin/bash

# Function to kill background processes on exit
cleanup() {
    echo "Stopping servers..."
    kill $(jobs -p)
    exit
}

trap cleanup SIGINT SIGTERM

echo "Starting Backend..."
cd backend
./venv/bin/python3 -m uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

echo "Starting Frontend..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo "App running!"
echo "Frontend: http://localhost:5173"
echo "Backend: http://localhost:8000"

wait
