from pydantic import BaseModel


class MetricsResponse(BaseModel):
    signups: int
    active_users: int
    waitlist: int
    page_views: int
