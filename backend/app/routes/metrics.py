from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models import User, Waitlist, PageView, WorkoutLog
from ..schemas.metrics import MetricsResponse

router = APIRouter(prefix="/api", tags=["metrics"])


@router.get("/metrics", response_model=MetricsResponse)
def get_metrics(db: Session = Depends(get_db)):
    """
    Public endpoint (no auth required) that returns aggregate metrics:
    - signups: total registered accounts in the database
    - active_users: users who completed at least one workout
    - waitlist: email signups before the product was live
    - page_views: total page views tracked
    """

    # Count total registered users (signups)
    signups = db.query(func.count(User.id)).scalar() or 0

    # Count active users (athletes who have completed at least one workout)
    active_users = (
        db.query(func.count(func.distinct(WorkoutLog.athlete_id)))
        .filter(WorkoutLog.is_completed == True)
        .scalar() or 0
    )

    # Count waitlist emails
    waitlist = db.query(func.count(Waitlist.id)).scalar() or 0

    # Count total page views
    page_views = db.query(func.count(PageView.id)).scalar() or 0

    return MetricsResponse(
        signups=signups,
        active_users=active_users,
        waitlist=waitlist,
        page_views=page_views
    )
