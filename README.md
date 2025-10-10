# EV Advisor

A web application for browsing and comparing electric vehicles built with FastAPI and modern web technologies.

## Setup

1. Create and activate a virtual environment:

```bash
python -m venv venv
.\venv\Scripts\activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Start the development server:

```bash
uvicorn app.main:app --reload
```

4. Open your browser and go to <http://localhost:8000>

## Features

- Browse electric vehicle catalog
- Filter by price, range, seats, and drivetrain
- Save favorite vehicles
- Search with natural language queries
- Responsive design for mobile and desktop

## Project Structure

- `app/` - Main application code
- `static/` - CSS, JavaScript, and images
- `templates/` - HTML templates
- `tests/` - Test suite

## Development

To restart the application after changes:

```bash
.\venv\Scripts\activate
uvicorn app.main:app --reload
```
