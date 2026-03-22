#!/bin/bash

echo "Starting EigenState Unified Backend"

# 1. Start Python Intelligence Layer in the background
echo "Starting Python API on port 8000..."
python3 python/api.py &
PYTHON_PID=$!

# Wait briefly
sleep 2

# 2. Start Go Backend in the foreground
echo "Starting Go API on port 8080..."
./server

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
