from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class NotificationResponse(BaseModel):
    id: int
    athlete_id: int
    athlete_name: str
    workout_log_id: Optional[int] = None
    program_id: Optional[int] = None
    program_name: Optional[str] = None
    message: str
    notification_type: str
    confidence: Optional[str] = None
    candidate_programs: Optional[List[str]] = None
    is_read: bool
    created_at: datetime
    body_region: Optional[str] = None
    body_region_detail: Optional[str] = None

    class Config:
        from_attributes = True
