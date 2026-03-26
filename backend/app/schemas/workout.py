from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ExerciseResponse(BaseModel):
    id: int
    name: str
    sets: int
    reps: int
    percentage_of_max: Optional[float] = None
    target_exercise: Optional[str] = None
    target_weight: Optional[float] = None
    video_url: Optional[str] = None
    coach_notes: Optional[str] = None
    order: int

    class Config:
        from_attributes = True

class WorkoutResponse(BaseModel):
    id: int
    name: str
    scheduled_date: datetime
    description: Optional[str] = None
    exercises: list[ExerciseResponse]
    workout_log_id: Optional[int] = None
    is_completed: bool
    is_flagged: bool
    athlete_modified: bool = False
    modification_notes: Optional[str] = None

    class Config:
        from_attributes = True


class ExerciseUpdate(BaseModel):
    id: Optional[int] = None  # None = new exercise
    name: str
    sets: int
    reps: int
    percentage_of_max: Optional[float] = None
    target_exercise: Optional[str] = None
    coach_notes: Optional[str] = None
    order: int


class WorkoutEdit(BaseModel):
    name: Optional[str] = None
    exercises: Optional[list[ExerciseUpdate]] = None
    modification_notes: Optional[str] = None


class SetLogCreate(BaseModel):
    exercise_id: int
    set_number: int
    weight_used: float
    reps_completed: int
    rpe: Optional[int] = None
    notes: Optional[str] = None
    video_url: Optional[str] = None
    was_modified: bool = False

class WorkoutComplete(BaseModel):
    notes: Optional[str] = None
    rpe: Optional[int] = None  # Session-level RPE 1-10

class FlagRequest(BaseModel):
    reason: str

class WorkoutLogResponse(BaseModel):
    id: int
    workout_id: int
    workout_name: str
    scheduled_date: datetime
    completed_at: Optional[datetime] = None
    is_completed: bool
    has_modifications: bool
    is_flagged: bool
    flag_reason: Optional[str] = None
    rpe: Optional[int] = None
    coach_acknowledged: bool = False
    coach_response: Optional[str] = None

    class Config:
        from_attributes = True
