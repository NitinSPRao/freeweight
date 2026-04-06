from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class AthleteBasic(BaseModel):
    id: int
    name: str
    email: str
    profile_photo_url: Optional[str] = None
    sport: Optional[str] = None
    team: Optional[str] = None

    class Config:
        from_attributes = True

class FlaggedAthlete(BaseModel):
    id: int
    name: str
    workout_name: str
    flag_reason: str
    flagged_at: datetime

class DashboardResponse(BaseModel):
    completed_today: int
    completed_workouts_today: int  # Deprecated, kept for backwards compatibility
    flagged_workouts: int
    flagged_athletes: List[FlaggedAthlete]
    total_athletes: int
    unread_notifications: int = 0

class GroupBasic(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True

class SubgroupBasic(BaseModel):
    id: int
    name: str
    training_focus: Optional[str] = None

    class Config:
        from_attributes = True

class AthleteWithGroups(AthleteBasic):
    groups: List[GroupBasic]
    subgroups: List[SubgroupBasic]

class RosterResponse(BaseModel):
    athletes: List[AthleteWithGroups]

class AthleteStatus(BaseModel):
    id: int
    name: str
    profile_photo_url: Optional[str] = None
    sport: Optional[str] = None
    status: str  # "active", "idle", "flagged", "new"
    last_workout_name: Optional[str] = None
    last_workout_date: Optional[datetime] = None
    workouts_this_week: int = 0
    has_flagged: bool = False

class AthleteStatusListResponse(BaseModel):
    athletes: List[AthleteStatus]

class InviteLinkResponse(BaseModel):
    invite_link: str
    coach_id: int
