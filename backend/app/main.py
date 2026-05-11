import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .routes import auth, coaches, programs, athletes, exercises, metrics, parse_program, folders

logger = logging.getLogger(__name__)

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

app = FastAPI(title="Freeweight API", version="1.0.0")

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
