.PHONY: help setup setup-frontend setup-backend dev build test test-frontend test-backend clean

# Default target
help:
	@echo "Available commands:"
	@echo "  make setup          - Install dependencies for both frontend and backend"
	@echo "  make setup-frontend - Install frontend dependencies"
	@echo "  make setup-backend  - Install backend dependencies"
	@echo "  make dev            - Run the backend development server"
	@echo "  make build          - Build the backend executable with PyInstaller"
	@echo "  make test           - Run tests for both frontend and backend"
	@echo "  make test-frontend  - Run frontend tests"
	@echo "  make test-backend   - Run backend tests"
	@echo "  make clean          - Clean build artifacts and caches"

# Setup all dependencies
setup: setup-frontend setup-backend
	@echo "✓ All dependencies installed successfully!"

# Setup frontend dependencies
setup-frontend:
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "✓ Frontend dependencies installed"

# Setup backend dependencies
setup-backend:
	@echo "Installing backend dependencies..."
	cd backend && ./.venv/bin/pip install -e ".[dev]"
	@echo "✓ Backend dependencies installed"

# Run backend development server
dev:
	@echo "Starting backend development server..."
	@echo "Config directory: ./config"
	cd backend && AI_ASSISTANT_CONFIG_DIR=../config ./.venv/bin/python -m src.main

# Build backend executable
build:
	@echo "Building backend executable with PyInstaller..."
	cd backend && ./.venv/bin/pyinstaller ai-assistant-backend.spec
	@echo "✓ Build completed! Executable is in backend/dist/ai-assistant-backend"

# Run all tests
test: test-backend test-frontend
	@echo "✓ All tests completed!"

# Run frontend tests
test-frontend:
	@echo "Running frontend tests..."
	cd frontend && npm test run

# Run backend tests
test-backend:
	@echo "Running backend tests..."
	cd backend && pytest -v

# Clean build artifacts and caches
clean:
	@echo "Cleaning build artifacts and caches..."
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name ".coverage" -delete 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	cd frontend && rm -rf node_modules dist 2>/dev/null || true
	cd backend && rm -rf build dist 2>/dev/null || true
	@echo "✓ Cleanup completed"

