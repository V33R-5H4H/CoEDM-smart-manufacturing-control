# Contributing to CoEDM Smart Manufacturing Control

Thank you for your interest in contributing to the CoEDM Smart Manufacturing Control system! This document provides guidelines for contributing to this project.

---

## Code of Conduct

- Be respectful and inclusive
- Focus on what is best for the community
- Show empathy towards other community members

---

## How to Contribute

### 1. Reporting Bugs

Before creating a bug report:
- Check if the issue has already been reported
- Use the latest version of the code
- Include detailed information about your environment

**Include:**
- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Screenshots if applicable
- Environment details (OS, Python version, etc.)

### 2. Suggesting Features

**Include:**
- A clear, descriptive title
- Detailed description of the feature
- Use cases and examples
- Any relevant technical considerations

### 3. Submitting Code

**Process:**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pytest`)
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

**Guidelines:**
- Follow the existing code style
- Write clear, descriptive commit messages
- Include tests for new features
- Update documentation as needed
- Keep PRs focused on a single feature or fix

---

## Project Structure

```
CoEDM-smart-manufacturing-control/
├── backend/          # Python/FastAPI backend
├── frontend/         # React frontend
├── docs/             # Documentation
├── scripts/          # Utility scripts
└── reference/        # Reference materials
```

See `reference/structure.md` for detailed structure information.

---

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+
- Git

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your configuration
python -m uvicorn api.main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

## Coding Standards

### Python

- Follow PEP 8 style guide
- Use type hints
- Write docstrings for all public functions
- Keep functions focused and small
- Use meaningful variable names

### JavaScript/React

- Follow Airbnb style guide
- Use functional components with hooks
- Write clear component names
- Keep components focused and small
- Use TypeScript when possible

### Database

- Use lowercase for table and column names
- Use snake_case for column names
- Add comments to complex queries
- Use transactions for data consistency

---

## Testing

### Backend Tests

```bash
cd backend
pytest
```

### Frontend Tests

```bash
cd frontend
npm test
```

---

## Documentation

- Update documentation for all new features
- Keep examples up to date
- Document API endpoints
- Document configuration options

---

## Pull Request Process

1. Fill out the PR template
2. Link related issues
3. Include test results
4. Request review from maintainers
5. Address review comments
6. Merge when approved

---

## Release Process

1. Create release branch
2. Update version numbers
3. Update changelog
4. Create tag
5. Build and test release
6. Deploy to production

---

## Questions?

- Check existing documentation
- Open an issue for questions
- Contact the development team

---

## Acknowledgments

Thank you for helping make this project better for everyone!
