# Read host ports from .env (if present) so the URLs printed below match what compose uses.
-include .env

.DEFAULT_GOAL := help
COMPOSE := docker compose
TEST_COMPOSE := docker compose -p ff-test -f docker-compose.test.yml

.PHONY: help dev ui up down reset logs test lint typecheck psql

help: ## Show available commands
	@grep -E '^[a-z-]+:.*## ' $(firstword $(MAKEFILE_LIST)) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36mmake %-10s\033[0m %s\n", $$1, $$2}'

.env:
	@cp .env.example .env
	@echo "Created .env from .env.example"

dev: .env ## Start the whole stack (migrates + seeds on first boot) with hot reload
	@echo ""
	@echo "  UI               http://localhost:$(or $(WEB_PORT),5173)"
	@echo "  API              http://localhost:$(or $(API_PORT),4000)/api/flags"
	@echo "  Webhook receiver http://localhost:$(or $(RECEIVER_PORT),4100)/events"
	@echo ""
	$(COMPOSE) up --build

ui: .env ## Run the apps on the host in Turborepo's TUI (sidebar per app); only Postgres stays in Docker
	@$(COMPOSE) stop api worker webhook-receiver web 2>/dev/null || true
	$(COMPOSE) up -d --wait db
	DATABASE_URL=postgres://$(or $(POSTGRES_USER),flags):$(or $(POSTGRES_PASSWORD),flags)@localhost:$(or $(DB_PORT),5433)/$(or $(POSTGRES_DB),flags) \
	WEBHOOK_URL=http://localhost:4100/webhooks/feature-flags \
	pnpm exec turbo run dev dev:worker

up: .env ## Same as dev, but in the background
	$(COMPOSE) up --build -d --wait web worker
	@echo "UI: http://localhost:$(or $(WEB_PORT),5173)"

down: ## Stop the stack (keeps data)
	$(COMPOSE) down

reset: ## Stop the stack and delete the database volume (next start reseeds)
	$(COMPOSE) down -v --remove-orphans

logs: ## Follow logs of all services
	$(COMPOSE) logs -f

test: ## Run lint, typecheck, API integration and E2E tests in an isolated stack
	./scripts/test.sh

lint: ## Lint + format check (in Docker)
	$(TEST_COMPOSE) run --rm --build --no-deps checks sh -c 'pnpm lint'

typecheck: ## Type-check every package (in Docker)
	$(TEST_COMPOSE) run --rm --build --no-deps checks sh -c 'pnpm typecheck'

psql: ## Open psql against the dev database
	$(COMPOSE) exec db psql -U $(or $(POSTGRES_USER),flags) -d $(or $(POSTGRES_DB),flags)
