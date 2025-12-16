# Event Booking System – Microservices Edition

Express.js + MySQL + Redis + NATS + Docker + Kubernetes (Minikube)

## 1. Overview

This project is a microservices-based Event Booking System built to demonstrate:

- Scalable Node.js microservices (Express, ES6)
- Race-condition-safe booking logic
- Redis caching
- Asynchronous messaging using NATS
- Containerization with Docker
- Kubernetes deployment using Minikube

The system is intentionally designed as an MVP with production-grade correctness, not feature bloat.

## 2. Services

### 1) User Service

- Create and fetch users
- Stores user data in MySQL

### 2) Event Service

- Create, update, and fetch events
- Caches GET /events/:id responses in Redis
- Cache invalidation on update

### 3) Booking Service

- Books seats for events
- Prevents overselling using MySQL transactions and row-level locking
- Publishes booking confirmation events to NATS

### 4) Notification Service

- Subscribes to booking events from NATS
- Stores booking confirmation logs in MySQL

## 3. Architecture Overview

**Synchronous (REST):**

- Client → User Service
- Client → Event Service
- Client → Booking Service

**Asynchronous (Event-driven):**

- Booking Service → NATS → Notification Service

**Data Stores:**

- MySQL: Primary data store
- Redis: Event read cache
- NATS: Message broker

## 4. Core Guarantee: No Overselling

### How race conditions are prevented

The Booking Service uses a database transaction with row-level locking:

```sql
BEGIN;
SELECT available_seats FROM events WHERE id=? FOR UPDATE;
-- if available_seats > 0
UPDATE events SET available_seats = available_seats - 1 WHERE id=?;
INSERT INTO bookings (...);
COMMIT;
```

Because the event row is locked during the transaction:

- Concurrent booking requests wait
- Only one request can decrement seats
- Overselling is impossible

This approach is database-backed and safe across multiple service replicas.

## 5. Run with Docker Compose (Local Development)

### Setup Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env if needed (default values work out of the box)
```

### Start all services

```bash
docker compose up --build
```

### Check status

```bash
docker compose ps
```

### Stop services

```bash
docker compose down
```

### Service URLs

- User Service: http://localhost:3001
- Event Service: http://localhost:3002
- Booking Service: http://localhost:3003
- Notification Service: http://localhost:3004

## 6. Run on Minikube (Kubernetes)

### Start Minikube

```bash
minikube start
```

### Build images inside Minikube Docker daemon

```bash
eval $(minikube docker-env)

docker build -t user-service:latest ./user-service
docker build -t event-service:latest ./event-service
docker build -t booking-service:latest ./booking-service
docker build -t notification-service:latest ./notification-service
```

### Deploy to Kubernetes

```bash
minikube kubectl -- apply -f k8s/
minikube kubectl -- get pods -n ebs
minikube kubectl -- get svc -n ebs
```

### Port-forward for local access

```bash
minikube kubectl -- port-forward -n ebs svc/user-service 3001:3000
minikube kubectl -- port-forward -n ebs svc/event-service 3002:3000
minikube kubectl -- port-forward -n ebs svc/booking-service 3003:3000
minikube kubectl -- port-forward -n ebs svc/notification-service 3004:3000
```

## 7. API Endpoints

### User Service

- `POST /users` – Create user
- `GET /users` – List users (paginated)
- `GET /users/:id` – Get user by ID
- `GET /health`

### Event Service

- `POST /events` – Create event
- `GET /events` – List events (paginated)
- `GET /events/:id` – Get event by ID (Redis cached)
- `PATCH /events/:id` – Update event (cache invalidation)
- `GET /health`

### Booking Service

- `POST /bookings` – Book a seat
- `GET /bookings` – List bookings (paginated)
- `GET /health`

### Notification Service

- `GET /notifications` – List booking notifications
- `GET /health`

## 8. End-to-End Demo Flow

1. **Create a user**

    ```bash
    POST http://localhost:3001/users
    ```

2. **Create an event**

    ```bash
    POST http://localhost:3002/events
    ```

3. **Fetch event twice**

    ```bash
    GET http://localhost:3002/events/:id
    ```

    → Second response shows `"cached": true`

4. **Book a seat**

    ```bash
    POST http://localhost:3003/bookings
    ```

5. **Verify notification**

    ```bash
    GET http://localhost:3004/notifications
    ```


## 9. Race Condition Demonstration

Create an event with `seats = 1`, then send concurrent booking requests.

**Windows PowerShell:**

```powershell
1..5 | % {
  Start-Job {
    curl -X POST http://localhost:3003/bookings `
      -H "Content-Type: application/json" `
      -d '{ "userId":"<USER_ID>", "eventId":"<EVENT_ID>" }'
  }
} | Receive-Job -Wait
```

**Expected Result:**

- Exactly 1 request succeeds
- Remaining requests return 409 – sold out

## 10. Postman Collection

**Import:** `postman/collection.json`

**Includes:**

- User APIs
- Event APIs
- Booking APIs
- Notification APIs

## 11. Troubleshooting

### Pods not starting (Minikube)

```bash
minikube kubectl -- get pods -n ebs
minikube kubectl -- logs -n ebs deployment/booking-service
```

### Database schema not applied (Docker Compose)

```bash
docker compose down -v
docker compose up --build
```

### Docker permission denied

```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Environment variables not loading

```bash
# Make sure .env file exists in the root directory
cp .env.example .env

# For Kubernetes, ensure ConfigMap and Secret are applied
kubectl get configmap -n ebs
kubectl get secret -n ebs
```

## 12. Environment Variables

All environment variables are managed through:

- **Docker Compose**: `.env` file in the root directory
- **Kubernetes**: `00-config.yaml` (ConfigMap and Secret)

**Key Variables:**

- `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DB` - Database configuration
- `REDIS_URL` - Redis connection string
- `NATS_URL` - NATS message broker URL
- `PORT` - Service port (default: 3000)
- `CACHE_TTL` - Event cache duration in seconds (default: 60)

**Security Note:** Never commit `.env` file to version control. Use `.env.example` as a template.

## 13. Notes on Design Decisions

- A single MySQL instance is used for speed and simplicity (MVP scope).
- Strict DB-per-service isolation was intentionally relaxed.
- Redis caching is applied only to single-event reads.
- NATS was chosen over Kafka for lightweight local orchestration.
- All timestamps are returned in ISO 8601 UTC format.
- Environment variables are centralized for easier configuration management.

## 14. Summary

This project demonstrates:

- Correct microservice boundaries
- Safe concurrency handling
- Event-driven architecture
- Containerized deployment
- Kubernetes-native service communication
- Centralized configuration management

It prioritizes correctness, clarity, and operational readiness over unnecessary complexity.
