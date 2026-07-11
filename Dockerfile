# Build React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Run FastAPI and serve the built UI
FROM python:3.13-slim
WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV SQLITE_PATH=/app/data/items.db
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--app-dir", "backend", "--port", "3000"]
