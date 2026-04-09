from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..auth import get_current_coach
from ..models import (
    User, Folder, Program, Workout, Exercise,
    WorkoutLog, SetLog, ProgramAssignment
)
from ..schemas.folder import (
    FolderCreate, FolderRename, FolderReorder,
    FolderContents, FolderBreadcrumb, FolderResponse
)

router = APIRouter(prefix="/api/coaches/folders", tags=["folders"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _collect_subtree_ids(folder_id: int, db: Session) -> List[int]:
    """Return folder_id plus all descendant IDs in BFS order (root first)."""
    ids = [folder_id]
    queue = [folder_id]
    while queue:
        rows = db.query(Folder.id).filter(Folder.parent_id.in_(queue)).all()
        child_ids = [r[0] for r in rows]
        if not child_ids:
            break
        ids.extend(child_ids)
        queue = child_ids
    return ids


def _build_breadcrumbs(folder: Folder, db: Session) -> List[FolderBreadcrumb]:
    """Walk parent chain to build root-first breadcrumb list."""
    crumbs = []
    current = folder
    while current is not None:
        crumbs.append(FolderBreadcrumb(id=current.id, name=current.name))
        if current.parent_id:
            current = db.query(Folder).filter(Folder.id == current.parent_id).first()
        else:
            current = None
    crumbs.reverse()
    return crumbs


def _serialize_folder(folder: Folder, db: Session) -> FolderContents:
    program_count = db.query(Program).filter(
        Program.folder_id == folder.id,
        Program.archived == False
    ).count()
    archived_program_count = db.query(Program).filter(
        Program.folder_id == folder.id,
        Program.archived == True
    ).count()
    return FolderContents(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        order=folder.order,
        created_at=folder.created_at,
        subfolders=[],
        program_count=program_count,
        archived_program_count=archived_program_count,
    )


def _program_to_dict(program: Program) -> dict:
    template_count = sum(1 for w in program.workouts if w.athlete_id is None)
    return {
        "id": program.id,
        "name": program.name,
        "description": program.description,
        "created_at": program.created_at.isoformat() if program.created_at else None,
        "workouts": [],
        "workout_count": template_count,
        "program_type": program.program_type or "strength",
        "body_regions": program.body_regions,
        "folder_id": program.folder_id,
        "order": program.order,
    }


def _delete_programs_in_folders(folder_ids: List[int], db: Session) -> int:
    """Hard-delete all programs (and their children) in the given folder IDs."""
    programs = db.query(Program).filter(Program.folder_id.in_(folder_ids)).all()
    program_ids = [p.id for p in programs]
    if not program_ids:
        return 0

    workout_ids = [
        w.id for w in
        db.query(Workout.id).filter(Workout.program_id.in_(program_ids)).all()
    ]
    if workout_ids:
        log_ids = [
            wl.id for wl in
            db.query(WorkoutLog.id).filter(WorkoutLog.workout_id.in_(workout_ids)).all()
        ]
        if log_ids:
            db.query(SetLog).filter(
                SetLog.workout_log_id.in_(log_ids)
            ).delete(synchronize_session=False)
        db.query(WorkoutLog).filter(
            WorkoutLog.workout_id.in_(workout_ids)
        ).delete(synchronize_session=False)
        db.query(Exercise).filter(
            Exercise.workout_id.in_(workout_ids)
        ).delete(synchronize_session=False)

    db.query(ProgramAssignment).filter(
        ProgramAssignment.program_id.in_(program_ids)
    ).delete(synchronize_session=False)
    db.query(Workout).filter(
        Workout.program_id.in_(program_ids)
    ).delete(synchronize_session=False)
    db.query(Program).filter(
        Program.id.in_(program_ids)
    ).delete(synchronize_session=False)

    return len(program_ids)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", response_model=FolderContents)
def create_folder(
    data: FolderCreate,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    if data.parent_id is not None:
        parent = db.query(Folder).filter(
            Folder.id == data.parent_id,
            Folder.coach_id == current_coach.id
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")

    order = db.query(Folder).filter(
        Folder.coach_id == current_coach.id,
        Folder.parent_id == data.parent_id
    ).count()

    folder = Folder(
        coach_id=current_coach.id,
        parent_id=data.parent_id,
        name=data.name,
        order=order,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)

    return _serialize_folder(folder, db)


@router.get("/root")
def get_root(
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    subfolders_db = db.query(Folder).filter(
        Folder.coach_id == current_coach.id,
        Folder.parent_id == None
    ).order_by(Folder.order).all()

    programs_db = db.query(Program).filter(
        Program.coach_id == current_coach.id,
        Program.folder_id == None,
        Program.archived == False
    ).order_by(Program.order).all()

    return jsonable_encoder(FolderResponse(
        folder=None,
        breadcrumbs=[],
        subfolders=[_serialize_folder(f, db) for f in subfolders_db],
        programs=[_program_to_dict(p) for p in programs_db],
    ))


# IMPORTANT: /reorder must be registered before /{folder_id} to avoid path conflict
@router.patch("/reorder")
def reorder_folders(
    data: FolderReorder,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    for item in data.folders:
        folder_id = item.get("id")
        new_order = item.get("order")
        if folder_id is None or new_order is None:
            raise HTTPException(status_code=400, detail="Each item must have 'id' and 'order'")

        folder = db.query(Folder).filter(
            Folder.id == folder_id,
            Folder.coach_id == current_coach.id
        ).first()
        if not folder:
            raise HTTPException(status_code=404, detail=f"Folder {folder_id} not found")

        folder.order = new_order

    db.commit()
    return {"message": "Reordered successfully"}


@router.get("/{folder_id}")
def get_folder(
    folder_id: int,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.coach_id == current_coach.id
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    subfolders_db = db.query(Folder).filter(
        Folder.parent_id == folder_id,
        Folder.coach_id == current_coach.id
    ).order_by(Folder.order).all()

    programs_db = db.query(Program).filter(
        Program.folder_id == folder_id,
        Program.archived == False
    ).order_by(Program.order).all()

    return jsonable_encoder(FolderResponse(
        folder=_serialize_folder(folder, db),
        breadcrumbs=_build_breadcrumbs(folder, db),
        subfolders=[_serialize_folder(f, db) for f in subfolders_db],
        programs=[_program_to_dict(p) for p in programs_db],
    ))


@router.patch("/{folder_id}", response_model=FolderContents)
def rename_folder(
    folder_id: int,
    data: FolderRename,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.coach_id == current_coach.id
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    folder.name = data.name
    db.commit()
    db.refresh(folder)

    return _serialize_folder(folder, db)


@router.delete("/{folder_id}")
def delete_folder(
    folder_id: int,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.coach_id == current_coach.id
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # Collect the full subtree (BFS order: root first, deepest last)
    subtree_ids = _collect_subtree_ids(folder_id, db)

    # Delete all programs in the subtree
    programs_deleted = _delete_programs_in_folders(subtree_ids, db)

    # Delete folders bottom-up (reverse BFS = deepest first)
    for fid in reversed(subtree_ids):
        f = db.query(Folder).filter(Folder.id == fid).first()
        if f:
            db.delete(f)

    db.commit()

    return {
        "message": "Folder and all contents deleted",
        "folders_deleted": len(subtree_ids),
        "programs_deleted": programs_deleted,
    }


@router.post("/{folder_id}/archive")
def archive_folder(
    folder_id: int,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.coach_id == current_coach.id
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    subtree_ids = _collect_subtree_ids(folder_id, db)

    updated = db.query(Program).filter(
        Program.folder_id.in_(subtree_ids),
        Program.archived == False
    ).all()
    for p in updated:
        p.archived = True

    db.commit()

    return {
        "message": "Folder archived",
        "programs_archived": len(updated),
    }


@router.patch("/{folder_id}/move", response_model=FolderContents)
def move_folder(
    folder_id: int,
    data: dict,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.coach_id == current_coach.id
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    new_parent_id: Optional[int] = data.get("parent_id")

    if new_parent_id is not None:
        # Verify new parent belongs to this coach
        new_parent = db.query(Folder).filter(
            Folder.id == new_parent_id,
            Folder.coach_id == current_coach.id
        ).first()
        if not new_parent:
            raise HTTPException(status_code=404, detail="Target parent folder not found")

        # Prevent moving into own subtree (cycle detection)
        subtree_ids = _collect_subtree_ids(folder_id, db)
        if new_parent_id in subtree_ids:
            raise HTTPException(
                status_code=400,
                detail="Cannot move a folder into its own descendant"
            )

    # Set order = count of existing folders at the new level
    order = db.query(Folder).filter(
        Folder.coach_id == current_coach.id,
        Folder.parent_id == new_parent_id,
        Folder.id != folder_id
    ).count()

    folder.parent_id = new_parent_id
    folder.order = order
    db.commit()
    db.refresh(folder)

    return _serialize_folder(folder, db)
