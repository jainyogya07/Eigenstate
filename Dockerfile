# Build Go App
FROM golang:latest AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/eigenstate

# Final Image with Python and Go binary
FROM python:3.11-slim
WORKDIR /app

# Install PostgreSQL client for health checks or migrations if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy Go binary
COPY --from=builder /app/server /app/server

# Copy Python Intel
COPY python/ /app/python/
RUN pip install --no-cache-dir -r python/requirements.txt

# Copy start script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Clean up
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

EXPOSE 8080 8000

CMD ["/app/start.sh"]
