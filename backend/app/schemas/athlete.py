from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class OnboardingRequest(BaseModel):
    sport: Optional[str] = None
    team: Optional[str] = None
    training_goals: Optional[str] = None
    injuries: Optional[str] = None
    experience_level: Optional[str] = None  # beginner, intermediate, advanced
    maxes: Optional[dict[str, float]] = None
    has_coach: bool = False  # True if athlete signed up with invite code
    goals: Optional[dict[str, dict]] = None  # e.g. {"squat": {"target_weight": 315, "target_date": "2026-06-01"}}


class MaxUpdate(BaseModel):
    exercise_name: str
    max_weight: float
    unit: str = "lbs"


class CalendarExerciseSummary(BaseModel):
    name: str
    sets: int
    reps: int

    class Config:
        from_attributes = True


class CalendarWorkout(BaseModel):
    id: int
    name: str
    scheduled_date: datetime
    is_completed: bool
    is_flagged: bool
    rpe: Optional[int] = None
    description: Optional[str] = None
    exercises: list[CalendarExerciseSummary] = []

    class Config:
        from_attributes = True


class ProgressDataPoint(BaseModel):
    date: datetime
    max_weight: float


class StrengthGoalResponse(BaseModel):
    id: int
    goal_type: str = "lift"
    exercise_name: Optional[str] = None
    starting_weight: Optional[float] = None
    target_weight: Optional[float] = None
    qualitative_goal: Optional[str] = None
    target_date: Optional[datetime] = None
    is_completed: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class StrengthGoalCreate(BaseModel):
    goal_type: str = "lift"  # "lift" or "qualitative"
    exercise_name: Optional[str] = None
    starting_weight: Optional[float] = None
    target_weight: Optional[float] = None
    qualitative_goal: Optional[str] = None
    target_date: Optional[str] = None  # ISO date string


class StrengthGoalUpdate(BaseModel):
    exercise_name: Optional[str] = None
    starting_weight: Optional[float] = None
    target_weight: Optional[float] = None
    qualitative_goal: Optional[str] = None
    target_date: Optional[str] = None
    is_completed: Optional[bool] = None


class ProgressResponse(BaseModel):
    exercise_name: str
    current_max: Optional[float] = None
    data: list[ProgressDataPoint]
    goal: Optional[StrengthGoalResponse] = None


class JoinCoachRequest(BaseModel):
    invite_code: str


class GenerateProgramRequest(BaseModel):
    weeks: Optional[int] = None
    target_date: Optional[str] = None  # ISO date string
    goals: Optional[list[str]] = None


class CreateWorkoutRequest(BaseModel):
    name: str
    description: Optional[str] = None
    scheduled_date: str  # ISO date string
    exercises: list[dict] = []  # [{name, sets, reps, percentage_of_max?, target_exercise?, coach_notes?, order}]


class CopyWorkoutRequest(BaseModel):
    scheduled_date: str  # ISO date string
