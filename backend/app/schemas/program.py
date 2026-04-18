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
    rest_seconds: Optional[int] = None
    group_label: Optional[str] = None
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
    rest_seconds: Optional[int] = None
    group_label: Optional[str] = None
    order: int

    class Config:
        from_attributes = True

class WorkoutCreate(BaseModel):
    name: str
    day_offset: int = 0
    week_number: Optional[int] = None
    day_label: Optional[str] = None
    description: Optional[str] = None

class WorkoutResponse(BaseModel):
    id: int
    name: str
    day_offset: Optional[int] = None
    week_number: Optional[int] = None
    day_label: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    description: Optional[str] = None
    exercises: List[ExerciseResponse]

    class Config:
        from_attributes = True

class ProgramCreate(BaseModel):
    name: str
    description: Optional[str] = None
    program_type: Optional[str] = "strength"
    body_regions: Optional[List[str]] = None
    folder_id: Optional[int] = None
    num_weeks: Optional[int] = 1
    day_mode: Optional[str] = "offset"
    is_ongoing: Optional[bool] = False
    same_every_week: Optional[bool] = False

class ProgramResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    workouts: List[WorkoutResponse]
    workout_count: int = 0
    program_type: str = "strength"
    body_regions: Optional[List[str]] = None
    num_weeks: Optional[int] = 1
    day_mode: Optional[str] = "offset"
    is_ongoing: bool = False
    same_every_week: bool = False

    class Config:
        from_attributes = True

class AssignmentCreate(BaseModel):
    athlete_id: Optional[int] = None
    group_id: Optional[int] = None
    subgroup_id: Optional[int] = None
    start_date: datetime
