.PHONY: help build up down logs shell-backend shell-db migrate seed clean

help:
	@echo "IT Asset Management Platform - Available Commands"
	@echo ""
	@echo "  make build            Build all Docker images"
	@echo "  make up               Start all containers"
	@echo "  make down             Stop all containers"
	@echo "  make logs             View backend logs (tail -f)"
	@echo "  make logs-frontend    View frontend logs"
	@echo "  make shell-backend    Access backend shell"
	@echo "  make shell-db         Access PostgreSQL shell"
	@echo "  make migrate          Run database migrations"
	@echo "  make seed             Seed database with sample data"
	@echo "  make clean            Clean up volumes and images"
	@echo ""

build:
	docker-compose build

up:
	docker-compose up -d
	@echo "✓ Containers started"
	@echo "  Frontend: http://localhost:5173"
	@echo "  Backend API: http://localhost:3000/api/docs"
	@echo "  pgAdmin: http://localhost:5050 (with --profile tools)"

down:
	docker-compose down

logs:
	docker logs -f itam_backend

logs-frontend:
	docker logs -f itam_frontend

shell-backend:
	docker exec -it itam_backend /bin/sh

shell-db:
	docker exec -it itam_postgres psql -U itam_admin -d itam_platform

migrate:
	docker exec itam_backend npx prisma migrate deploy

seed:
	docker exec itam_backend npx prisma db seed

restart:
	docker-compose restart

clean:
	docker-compose down -v
	docker system prune -f

test-inventory:
	@echo "Testing inventory endpoint..."
	curl -X GET http://localhost:3000/api/v1/inventory | jq '.[] | {computerName, osName, lastSeenAt}' | head -20

test-ad:
	@echo "Testing AD sync..."
	curl -X POST http://localhost:3000/api/v1/active-directory/sync | jq '.'

test-compliance:
	@echo "Testing compliance alerts..."
	curl -X GET http://localhost:3000/api/v1/software-compliance/alerts | jq '.[] | {softwareName, message, laggingCount}'
