from pydantic import BaseModel
from typing import Optional


class ExerciseCatalogCreate(BaseModel):
    name: str
    category: Optional[str] = None
    muscle_group: Optional[str] = None


class ExerciseCatalogResponse(BaseModel):
    id: int
    name: str
    category: Optional[str] = None
    muscle_group: Optional[str] = None
    is_custom: bool = False

    class Config:
        from_attributes = True
