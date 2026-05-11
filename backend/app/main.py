from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import auth, coaches, programs, athletes, exercises, metrics, parse_program, folders

app = FastAPI(title="Freeweight API", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
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
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
