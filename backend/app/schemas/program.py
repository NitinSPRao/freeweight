from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ExerciseCreate(BaseModel):
    name: str
    sets: int
    reps: int
    percentage_of_max: Optional[float] = None
    target_exercise: Optional[str] = None
    video_url: Optional[str] = None
    coach_notes: Optional[str] = None
    order: int

class ExerciseResponse(BaseModel):
    id: int
    name: str
    sets: int
    reps: int
    percentage_of_max: Optional[float] = None
    target_exercise: Optional[str] = None
    video_url: Optional[str] = None
    coach_notes: Optional[str] = None
    order: int

    class Config:
        from_attributes = True

class WorkoutCreate(BaseModel):
    name: str
    day_offset: int
    description: Optional[str] = None

class WorkoutResponse(BaseModel):
    id: int
    name: str
    day_offset: Optional[int] = None
    scheduled_date: Optional[datetime] = None
    description: Optional[str] = None
    exercises: List[ExerciseResponse]

    class Config:
        from_attributes = True

class ProgramCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ProgramResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    workouts: List[WorkoutResponse]
    workout_count: int = 0

    class Config:
        from_attributes = True

class AssignmentCreate(BaseModel):
    athlete_id: Optional[int] = None
    group_id: Optional[int] = None
    subgroup_id: Optional[int] = None
    start_date: datetime
