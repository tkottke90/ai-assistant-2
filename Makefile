.PHONY: help setup setup-frontend setup-backend dev build test test-frontend test-backend compile clean

# Virtualenv configuration
VENV := ./.venv
VENV_PY := $(VENV)/bin/python
VENV_PIP := $(VENV)/bin/pip
VENV_PYTEST := $(VENV)/bin/pytest

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
	@echo "  make compile        - Check Python syntax (py_compile) using venv"
	@echo "  make clean          - Clean build artifacts and caches"

# Setup all dependencies
setup: setup-backend
	@echo "✓ All dependencies installed successfully!"

# Setup backend dependencies
ensure-venv:
	@echo "Ensuring virtualenv exists at $(VENV)"
	@if [ ! -d "$(VENV)" ]; then \
		python3 -m venv $(VENV); \
		$(VENV_PIP) install --upgrade pip setuptools wheel; \
	else \
		echo "Virtualenv already exists at $(VENV)"; \
	fi

setup-backend: ensure-venv
	@echo "Installing backend dependencies..."
	$(VENV_PIP) install -e ".[dev]"
	@echo "✓ Backend dependencies installed"

# Run backend development server
dev: ensure-venv
	@echo "Starting backend development server..."
	@echo "Config directory: ./config"
	cd backend && AI_ASSISTANT_CONFIG_DIR=../config ../$(VENV_PY) -m src.main

# Build backend executable
build: ensure-venv
	@echo "Building backend executable with PyInstaller..."
	$(VENV_PY) -m PyInstaller ai-assistant-backend.spec
	@echo "✓ Build completed! Executable is in backend/dist/ai-assistant-backend"

# Run all tests
test: test-backend test-frontend
	@echo "✓ All tests completed!"

# Run backend tests
test-backend: ensure-venv
	@echo "Running backend tests..."
	$(VENV_PYTEST) -v

# Pattern rule: allow running a single pytest node via make
.PHONY: tests/%
tests/%:
	@echo "Running pytest for $@"
	$(VENV_PYTEST) -v $@

# Check Python syntax using py_compile
compile: ensure-venv
	@echo "Checking Python syntax..."
	cd backend && $(VENV_PY) -m py_compile $$(find src -name "*.py")
	@echo "✓ Syntax check passed!"

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
	cd frontend && rm -rf dist 2>/dev/null || true
	cd backend && rm -rf build dist 2>/dev/null || true
	@echo "✓ Cleanup completed"

