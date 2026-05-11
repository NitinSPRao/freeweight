import logging
import os
from contextlib import asynccontextmanager

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .routes import auth, coaches, programs, athletes, exercises, metrics, parse_program, folders

logger = logging.getLogger(__name__)


def _run_migrations() -> None:
    # Render's dashboard start command overrides Procfile/nixpacks, so we
    # cannot guarantee `alembic upgrade head` runs on deploy from the shell.
    # Running it from the app's startup hook ensures it always runs as long
    # as uvicorn boots the app, regardless of how the container is started.
    # alembic upgrade head is idempotent — safe to run every restart.
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    alembic_ini = os.path.join(backend_dir, "alembic.ini")
    logger.info("Running alembic upgrade head from %s", alembic_ini)
    cfg = Config(alembic_ini)
    command.upgrade(cfg, "head")
    logger.info("Alembic migrations applied")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        _run_migrations()
    except Exception:
        # Fail loudly: if migrations fail, do not accept traffic with a
        # mismatched schema. Re-raise so uvicorn exits and Render marks
        # the deploy as failed.
        logger.exception("Alembic migrations failed on startup")
        raise
    yield

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:3001",
    "https://freeweight.fit",
    "https://www.freeweight.fit",
    "https://app.freeweight.fit",
    "https://freeweight.com",
    "https://www.freeweight.com",
    "https://app.freeweight.com",
    "https://freeweight-prod.onrender.com",
    "https://freeweight-prod.vercel.app",
]

app = FastAPI(title="Freeweight API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Starlette's ServerErrorMiddleware wraps CORSMiddleware, so unhandled
    # exceptions return 500 responses that bypass CORS header injection.
    # This handler keeps the response on the CORS-aware path so the browser
    # sees the real status instead of a generic CORS block.
    logger.exception(
        "Unhandled exception on %s %s", request.method, request.url.path
    )
    origin = request.headers.get("origin")
    headers = {}
    if origin and origin in ALLOWED_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Vary"] = "Origin"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )


app.include_router(auth.router)
app.include_router(coaches.router)
app.include_router(folders.router)
app.include_router(parse_program.router)
app.include_router(programs.router)
app.include_router(athletes.router)
app.include_router(exercises.router)
app.include_router(metrics.router)


@app.get("/")
def root():
    return {"message": "Freeweight API"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
