# EVision Advisor

A web application for browsing and searching electric vehicles with natural language processing capabilities.

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Features

- Browse electric vehicles with detailed specifications
- Natural language search (e.g., "affordable SUV under 50000")
- Filter by price, range, body type, drivetrain, and seats
- Save vehicles for later comparison
- Responsive design for mobile and desktop
- Semantic search using sentence-transformers
- Rate limiting and session management
- Result caching for better performance

## Technology Stack

**Backend**
- FastAPI - Web framework
- Pydantic - Data validation and settings
- Jinja2 - Template engine
- Uvicorn - ASGI server
- NumPy - Numerical operations
- Sentence Transformers - Semantic search (optional)
- CacheTools - In-memory caching

**Frontend**
- JavaScript (vanilla)
- CSS3 (Grid and Flexbox)
- Lazy loading for images

**Deployment**
- Railway or Vercel
- Pytest for testing

## Prerequisites

- Python 3.9 or higher
- pip (usually included with Python)
- Git (optional)

Check your Python version:

```bash
python --version
```

## Installation

Clone the repository:

```bash
git clone https://github.com/ginesbal/ev_chatbotmodel.git
cd ev_chatbotmodel
```

Create and activate a virtual environment:

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**macOS/Linux:**
```bash
python -m venv venv
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

## Configuration

Create a `.env` file in the root directory with the following settings:

```
EVISION_SECRET_KEY=your-secret-key-here
DEBUG=false
SEMANTIC_SEARCH=auto
RATE_LIMIT_PER_MIN=60
```

Generate a secret key:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Configuration variables:**
- `EVISION_SECRET_KEY` - Session encryption key (required for production)
- `DEBUG` - Enable verbose logging and disable rate limiting
- `SEMANTIC_SEARCH` - `auto` for NLP search, `off` for keyword-only
- `RATE_LIMIT_PER_MIN` - Max requests per IP per minute

## Running the Application

Start the development server:

```bash
uvicorn app.main:app --reload
```

The application will be available at `http://127.0.0.1:8000`

For production:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

For serverless deployment (Vercel):

```bash
uvicorn api.index:app --reload
```

Stop the server with `CTRL+C`. Deactivate the virtual environment with `deactivate`.

## Deployment

### Railway

Recommended platform with automatic deployments.

1. Create an account at railway.app
2. Click "New Project" > "Deploy from GitHub repo"
3. Select the `ev_chatbotmodel` repository
4. Add environment variables (especially `EVISION_SECRET_KEY`)
5. Railway will build and deploy automatically



### Vercel

Deploy with:

```bash
vercel --prod
```

Configuration files: `vercel.json` and `api/index.py`

### Manual Server

Requirements: Python 3.9+, systemd or supervisor, Nginx/Apache

Example systemd service:

```ini
[Unit]
Description=EVision Advisor
After=network.target

[Service]
User=www-data
WorkingDirectory=/path/to/ev_chatbotmodel
Environment="PATH=/path/to/ev_chatbotmodel/venv/bin"
ExecStart=/path/to/ev_chatbotmodel/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

## Project Structure

```
ev_chatbotmodel/
├── api/
│   ├── index.py              # Serverless entry point (Vercel/AWS Lambda)
│   └── __pycache__/
├── app/
│   ├── __init__.py
│   ├── config.py             # Application configuration and settings
│   ├── main.py               # Main FastAPI application
│   ├── obsv.py               # Observability and logging setup
│   ├── rate_limit.py         # Rate limiting middleware
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py        # Pydantic models for data validation
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── health.py         # Health check endpoint
│   │   ├── home.py           # Home page route
│   │   ├── saved.py          # Saved vehicles management
│   │   └── search.py         # Search and filtering logic
│   ├── services/
│   │   ├── __init__.py
│   │   ├── nlp.py            # Natural language processing
│   │   ├── repository.py     # Data access layer
│   │   └── search_service.py # Search and ranking algorithms
│   └── utils/
│       ├── __init__.py
│       └── evtable.py        # Electric vehicle data utilities
├── static/
│   ├── css/                  # Stylesheets
│   ├── js/                   # JavaScript files
│   ├── images/               # Images and icons
│   └── fonts/                # Web fonts
├── templates/
│   ├── base.html             # Base template with common layout
│   ├── home.html             # Home page template
│   ├── browse.html           # Browse vehicles template
│   ├── index.html            # Landing page
│   └── includes/             # Reusable template fragments
├── tests/
│   ├── conftest.py           # Pytest configuration and fixtures
│   ├── test_cases.yaml       # Test case definitions
│   ├── test_search_suite.py  # Search functionality tests
│   ├── test_saved_endpoints.py # Saved vehicles tests
│   └── ...                   # Additional test files
├── docs/                     # Documentation and screenshots
├── .env                      # Environment variables (not in repository)
├── .gitignore                # Git ignore rules
├── requirements.txt          # Python dependencies
├── Procfile                  # Process file for Railway deployment
├── railway.json              # Railway configuration
├── runtime.txt               # Python runtime version
├── vercel.json               # Vercel configuration
├── RAILWAY_DEPLOYMENT.md     # Railway deployment guide
└── README.md                 # This file
```

**Key Files:**
- `app/main.py` - Main application and route registration
- `app/config.py` - Configuration and settings
- `app/services/search_service.py` - Search logic and ranking
- `app/services/nlp.py` - Semantic search implementation
- `app/routes/` - HTTP endpoint handlers
- `requirements.txt` - Python dependencies
- `Procfile` - Deployment configuration

## API Endpoints

**GET /**  
Home page with vehicle browser

**GET /health**  
Health check - returns `{"ok": true}`

**GET /search**  
Search vehicles with query parameters:
- `q` - Search query
- `price_max` - Maximum price (CAD)
- `range_min` - Minimum range (km)
- `body_type` - sedan, suv, truck, etc.
- `seats` - Minimum seating capacity
- `drivetrain` - all-wheel-drive, rear-wheel-drive, front-wheel-drive
- `sort` - relevance, price, range, efficiency

**POST /saved/add**  
Add vehicle to saved list - Body: `{"vin": "vehicle-vin"}`

**POST /saved/remove**  
Remove vehicle from saved list - Body: `{"vin": "vehicle-vin"}`

**GET /saved**  
View saved vehicles page

**GET /saved/data**  
Get saved vehicles as JSON

**Response codes:**
- 200 - Success
- 400 - Invalid parameters
- 404 - Not found
- 429 - Rate limit exceeded
- 500 - Server error

## Testing

Run all tests:

```bash
pytest
```

Run specific test file:

```bash
pytest tests/test_search_suite.py
```

Run with coverage:

```bash
pytest --cov=app --cov-report=html
```

**Test files:**
- `test_search_suite.py` - Search functionality
- `test_saved_endpoints.py` - Saved vehicles
- `test_parser_filters.py` - Query parsing
- `test_ranking_brand_model.py` - Ranking algorithms
- `test_sorting_determinism.py` - Sort consistency
- `test_sort_stability.py` - Sort stability
- `test_saved_counts_parity.py` - Data consistency

Test configuration is in `tests/conftest.py` and `tests/test_cases.yaml`.

## Troubleshooting

**ModuleNotFoundError**  
Activate virtual environment and reinstall dependencies:
```bash
pip install -r requirements.txt
```

**Port already in use**  
Use a different port:
```bash
uvicorn app.main:app --reload --port 8001
```

**Static files not loading**  
Verify `static/` directory exists and `STATIC_DIR` config is correct.

**Semantic search not working**  
Check `SEMANTIC_SEARCH` setting. Model download requires ~80MB disk space.

**Session data lost**  
Set `EVISION_SECRET_KEY` in `.env` file.

**Rate limit errors**  
Set `DEBUG=true` in `.env` to disable rate limiting.

**Tests failing**  
Verify dependencies and test data files exist:
```bash
pip install -r requirements.txt
pytest --version
```

Check `app.log` for error details.
