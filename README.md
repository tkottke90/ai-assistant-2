# AI Assistant 2

A full-stack AI assistant application with a TypeScript/Vite frontend and Python backend.

## Project Structure

```
ai-assistant-2/
├── frontend/          # TypeScript + Vite frontend
├── backend/           # Python backend
├── Makefile          # Build and test automation
└── README.md         # This file
```

## Prerequisites

- **Node.js** (v18 or higher)
- **npm** (v8 or higher)
- **Python** (3.10 or higher)
- **pip** (Python package manager)
- **make** (for running Makefile commands)

## Getting Started

### 1. Install Dependencies

Install dependencies for both frontend and backend:

```bash
make setup
```

Or install them separately:

```bash
# Frontend only
make setup-frontend

# Backend only
make setup-backend
```

### 2. Running Tests

#### Run All Tests

Run tests for both frontend and backend:

```bash
make test
```

#### Frontend Tests

The frontend uses **Vitest** for testing.

```bash
# Run tests once
make test-frontend

# Or use npm directly in the frontend directory
cd frontend
npm test run           # Run tests once
npm test              # Run tests in watch mode
npm run test:ui       # Run tests with UI
npm run test:coverage # Run tests with coverage report
```

**Frontend Test Files:**
- Test files are located next to source files with `.spec.ts` extension
- Example: `src/counter.spec.ts`
- Test setup: `src/test/setup.ts`
- Configuration: `vitest.config.ts`

#### Backend Tests

The backend uses **pytest** for testing.

```bash
# Run tests
make test-backend

# Or use pytest directly in the backend directory
cd backend
pytest                    # Run all tests
pytest -v                 # Run with verbose output
pytest --cov=backend      # Run with coverage report
pytest tests/test_main.py # Run specific test file
```

**Backend Test Files:**
- Test files are located in `backend/tests/` directory
- Test files follow the pattern `test_*.py` or `*_test.py`
- Configuration: `pyproject.toml`

## Development

### Frontend Development

```bash
cd frontend
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

### Backend Development

```bash
cd backend
# Add your backend development commands here
```

## Cleaning Up

Remove build artifacts and caches:

```bash
make clean
```

This will remove:
- Python `__pycache__`, `.pytest_cache`, `.mypy_cache`
- Python build artifacts (`*.egg-info`, `build/`, `dist/`)
- Coverage reports (`htmlcov/`, `.coverage`)
- Frontend `node_modules` and `dist/` (optional)

## Available Make Commands

```bash
make help           # Show all available commands
make setup          # Install all dependencies
make setup-frontend # Install frontend dependencies
make setup-backend  # Install backend dependencies
make test           # Run all tests
make test-frontend  # Run frontend tests
make test-backend   # Run backend tests
make clean          # Clean build artifacts
```

## Testing Guidelines

### Frontend Testing

- Write tests next to your source files with `.spec.ts` extension
- Use `describe` blocks to group related tests
- Use `it` or `test` for individual test cases
- Example test structure:

```typescript
import { describe, it, expect } from 'vitest'

describe('MyComponent', () => {
  it('should do something', () => {
    expect(true).toBe(true)
  })
})
```

### Backend Testing

- Write tests in the `backend/tests/` directory
- Use `test_*.py` naming convention
- Use pytest fixtures for shared setup
- Example test structure:

```python
import pytest

def test_something():
    assert True

class TestMyFeature:
    def test_specific_case(self):
        assert 1 + 1 == 2
```

## Contributing

1. Create a new branch for your feature
2. Write tests for your changes
3. Ensure all tests pass with `make test`
4. Submit a pull request

## License

MIT