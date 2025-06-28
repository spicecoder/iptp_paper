#!/bin/bash

PORT=5000
PID=$(lsof -ti tcp:$PORT)

if [ -z "$PID" ]; then
  echo "✅ No process is using port $PORT."
else
  echo "⚠️ Killing process $PID using port $PORT..."
  kill -9 $PID
  echo "✅ Port $PORT is now free."
fi
