# FastAPI Server

REST API server for the RAG Component System, enabling web-based access to component indexing and retrieval.

**✨ Production-Ready Features:**
- Professional logging system with file and console output
- Comprehensive error handling with specific HTTP status codes
- Type-safe request validation with Pydantic
- Process timeouts for long-running operations
- Enhanced monitoring and debugging capabilities

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Server Management](#server-management)
- [API Endpoints](#api-endpoints)
- [Architecture](#architecture)
- [Development](#development)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip3 install -r server/requirements.txt
```

**Installs:**
- `fastapi>=0.104.0` - Modern async web framework
- `uvicorn[standard]>=0.24.0` - ASGI server
- `pydantic>=2.0.0` - Data validation

### 2. Verify Installation

```bash
python3 -c "import fastapi; print(f'FastAPI {fastapi.__version__} installed')"
```

### 3. Start the Server

```bash
python3 server/api_server.py
```

**Server URLs:**
- **API Base**: http://localhost:8000
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 🎛️ Server Management

### Development Mode (with auto-reload)

```bash
# Option 1: Direct run (recommended)
python3 server/api_server.py

# Option 2: Using uvicorn directly
uvicorn server.api_server:app --reload --host 0.0.0.0 --port 8000
```

### Stop Server

**Foreground process:**
```bash
# Press Ctrl+C in the terminal
```

**Background process:**
```bash
# Find and kill by port
lsof -ti:8000 | xargs kill

# Or kill by process name
pkill -f "uvicorn.*api_server"
```

### Production Mode

```bash
# Without reload (basic production)
uvicorn server.api_server:app --host 0.0.0.0 --port 8000 --workers 4

# With Gunicorn (recommended for production)
gunicorn server.api_server:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

---

## 📡 API Endpoints

### Health & Info

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API information and available endpoints |
| `/api/health` | GET | Health check with database statistics |

### Indexing

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/index/build` | POST | Build index (simple pipeline) |
| `/api/index/rebuild` | POST | Rebuild with validation and versioning |

### Components

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/components` | GET | List all available components |
| `/api/components/{name}` | GET | Get specific component by exact name |
| `/api/components/search` | POST | Semantic search for components |

### Quick Examples

**List components:**
```bash
curl "http://localhost:8000/api/components"
```

**Get specific component:**
```bash
curl "http://localhost:8000/api/components/ProfilePage"
```

**Search components:**
```bash
curl -X POST "http://localhost:8000/api/components/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "user profile", "k": 5}'
```

**Build index:**
```bash
curl -X POST "http://localhost:8000/api/index/build" \
  -H "Content-Type: application/json" \
  -d '{"clean": true}'
```

For detailed API documentation with request/response examples, see [FASTAPI-DOCUMENTATION.md](../FASTAPI-DOCUMENTATION.md)

---

## 🏗️ Architecture

### Technology Stack

- **FastAPI**: Modern async web framework for building APIs
- **Uvicorn**: Lightning-fast ASGI server
- **Pydantic**: Data validation and serialization
- **CORS**: Enabled for cross-origin requests

### Integration with Core System

The server integrates seamlessly with the core RAG system:

```
server/api_server.py
    ↓
├── Queries: core/query_cli.py (ComponentQueryer)
├── Indexing: core/build_index.py, core/rebuild_index.py
└── Database: build-index/chromadb/
```

**Key Components:**
- Uses `ComponentQueryer` from `core/query_cli.py` for database queries
- Calls `core/build_index.py` and `core/rebuild_index.py` via subprocess for indexing
- Accesses ChromaDB at `build-index/chromadb/` for vector storage

---

## 🛠️ Development

### Auto-Reload

The server supports auto-reload in development mode. Any changes to `api_server.py` will automatically restart the server.

```bash
python3 server/api_server.py
# Server watches for file changes and reloads automatically
```

### Testing the API

**Interactive Documentation:**
- Visit http://localhost:8000/docs for Swagger UI
- Try out endpoints directly from the browser
- View request/response schemas

**Command Line Testing:**
```bash
# Using curl
curl "http://localhost:8000/api/health"

# Using HTTPie (install with: pip3 install httpie)
http GET localhost:8000/api/components

# Using Python requests
python3 -c "import requests; print(requests.get('http://localhost:8000/api/health').json())"
```

### Adding Custom Logging

Add to `api_server.py`:

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Use in endpoints
@app.get("/api/components")
async def list_components():
    logger.info("Listing components...")
    # ...
```

---

## 🚀 Production Deployment

### Using Gunicorn + Uvicorn Workers

```bash
# Install Gunicorn
pip3 install gunicorn

# Run with multiple workers
gunicorn server.api_server:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --access-logfile - \
  --error-logfile -
```

### Using Docker

**Dockerfile:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY server/requirements.txt server/
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir -r server/requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8000

# Run server
CMD ["uvicorn", "server.api_server:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Build and Run:**
```bash
docker build -t rag-api .
docker run -p 8000:8000 rag-api
```

### CORS Configuration

For production, update CORS settings in `server/api_server.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com"],  # Specify actual origins
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
```

---

## 🔧 Troubleshooting

### Port Already in Use

```bash
# Find and kill process using port 8000
lsof -ti:8000 | xargs kill

# Or use a different port
uvicorn server.api_server:app --port 8001
```

### Database Not Found

Ensure the index is built before starting the server:

```bash
python3 core/build_index.py
```

### Import Errors

Make sure you're running from the project root directory:

```bash
cd /path/to/poc_rag_builder
python3 server/api_server.py
```

### Module Not Found: query_cli

The server needs to import from the `core/` directory. Ensure the project structure is correct:

```
poc_rag_builder/
├── core/
│   └── query_cli.py
└── server/
    └── api_server.py
```

---

## 📚 Additional Resources

- **Improvements Documentation**: [IMPROVEMENTS.md](IMPROVEMENTS.md) - Detailed production features
- **Complete API Documentation**: [FASTAPI-DOCUMENTATION.md](../FASTAPI-DOCUMENTATION.md)
- **Main Project README**: [README.md](../README.md)
- **FastAPI Official Docs**: https://fastapi.tiangolo.com/

---