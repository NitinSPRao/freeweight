from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from ..database import get_db
from ..auth import get_current_user
from .. import models
from ..schemas.exercise_catalog import ExerciseCatalogCreate, ExerciseCatalogResponse

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


@router.get("", response_model=list[ExerciseCatalogResponse])
def list_exercises(
    search: Optional[str] = None,
    category: Optional[str] = None,
    muscle_group: Optional[str] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.ExerciseCatalog).filter(
        or_(
            models.ExerciseCatalog.is_custom == False,
            models.ExerciseCatalog.created_by == current_user.id
        )
    )

    if search:
        query = query.filter(models.ExerciseCatalog.name.ilike(f"%{search}%"))
    if category:
        query = query.filter(models.ExerciseCatalog.category == category)
    if muscle_group:
        query = query.filter(models.ExerciseCatalog.muscle_group == muscle_group)

    return query.order_by(models.ExerciseCatalog.name).all()


@router.post("", response_model=ExerciseCatalogResponse, status_code=status.HTTP_201_CREATED)
def create_exercise(
    data: ExerciseCatalogCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    existing = db.query(models.ExerciseCatalog).filter(
        models.ExerciseCatalog.name.ilike(data.name),
        or_(
            models.ExerciseCatalog.is_custom == False,
            models.ExerciseCatalog.created_by == current_user.id
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Exercise already exists")

    exercise = models.ExerciseCatalog(
        name=data.name,
        category=data.category,
        muscle_group=data.muscle_group,
        is_custom=True,
        created_by=current_user.id
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


@router.delete("/{exercise_id}")
def delete_exercise(
    exercise_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exercise = db.query(models.ExerciseCatalog).filter(
        models.ExerciseCatalog.id == exercise_id,
        models.ExerciseCatalog.created_by == current_user.id,
        models.ExerciseCatalog.is_custom == True
    ).first()

    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found or cannot be deleted")

    db.delete(exercise)
    db.commit()
    return {"message": "Exercise deleted"}
