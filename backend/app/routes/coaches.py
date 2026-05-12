from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from pydantic import BaseModel
import json
import logging
from ..database import get_db
from ..auth import get_current_coach
from ..models import User, Group, Subgroup, WorkoutLog, SetLog, AthleteMax, Workout, ProgramAssignment, group_members, Program, Exercise, Notification
from ..schemas.coach import (
    DashboardResponse,
    RosterResponse,
    InviteLinkResponse,
    FlaggedAthlete,
    AthleteWithGroups,
    AthleteStatus,
    AthleteStatusListResponse,
    GroupBasic,
    SubgroupBasic
)
from ..schemas.group import GroupCreate, SubgroupCreate
from ..schemas.notifications import NotificationResponse
from ..config import settings
import random
import string

logger = logging.getLogger(__name__)


def _generate_unique_group_code(db: Session) -> str:
    """Generate a 6-char invite code that is unique across both the groups and users tables."""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        # Must not clash with any group invite code or any coach invite code
        if (
            not db.query(Group).filter(Group.invite_code == code).first()
            and not db.query(User).filter(User.invite_code == code).first()
        ):
            return code

router = APIRouter(prefix="/api/coaches", tags=["coaches"])

@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    # Hardcoded values for MVP
    completed_today = 6

    flagged = db.query(WorkoutLog).join(User).filter(
        User.id.in_([a.id for a in current_coach.coached_athletes]),
        WorkoutLog.is_flagged == True
    ).order_by(WorkoutLog.created_at.desc()).limit(3).all()  # Limit to 3 flagged workouts

    flagged_athletes = []
    seen_athlete_ids = set()
    for log in flagged:
        if log.athlete_id not in seen_athlete_ids:
            # Get the workout name for this flagged log
            workout = db.query(Workout).filter(Workout.id == log.workout_id).first()
            workout_name = workout.name if workout else "Unknown Workout"

            flagged_athletes.append(FlaggedAthlete(
                id=log.athlete.id,
                name=log.athlete.name,
                workout_name=workout_name,
                flag_reason=log.flag_reason or "No reason provided",
                flagged_at=log.created_at
            ))
            seen_athlete_ids.add(log.athlete_id)

    unread_notifications = db.query(Notification).filter(
        Notification.coach_id == current_coach.id,
        Notification.is_read == False
    ).count()

    return DashboardResponse(
        completed_today=completed_today,
        completed_workouts_today=completed_today,  # Backwards compatibility
        flagged_workouts=len(flagged_athletes),
        flagged_athletes=flagged_athletes,
        total_athletes=len(current_coach.coached_athletes),
        unread_notifications=unread_notifications,
    )

@router.get("/roster", response_model=RosterResponse)
def get_roster(
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    athletes_with_groups = []
    for athlete in current_coach.coached_athletes:
        athletes_with_groups.append(AthleteWithGroups(
            id=athlete.id,
            name=athlete.name,
            email=athlete.email,
            profile_photo_url=athlete.profile_photo_url,
            sport=athlete.sport,
            team=athlete.team,
            groups=[GroupBasic(id=g.id, name=g.name) for g in athlete.groups],
            subgroups=[SubgroupBasic(id=s.id, name=s.name, training_focus=s.training_focus) for s in athlete.subgroups]
        ))

    return RosterResponse(athletes=athletes_with_groups)

@router.get("/invite-code")
def get_invite_code(
    current_coach: User = Depends(get_current_coach)
):
    return {"invite_code": current_coach.invite_code}

@router.get("/athlete-statuses", response_model=AthleteStatusListResponse)
def get_athlete_statuses(
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    """Get quick-view status for all athletes on the coach's roster."""
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    three_days_ago = datetime.now(timezone.utc) - timedelta(days=3)

    statuses = []
    for athlete in current_coach.coached_athletes:
        # Get most recent completed workout log
        last_log = db.query(WorkoutLog).filter(
            WorkoutLog.athlete_id == athlete.id,
            WorkoutLog.is_completed == True
        ).order_by(WorkoutLog.created_at.desc()).first()

        # Count workouts this week
        week_logs = db.query(WorkoutLog).filter(
            WorkoutLog.athlete_id == athlete.id,
            WorkoutLog.is_completed == True,
            WorkoutLog.created_at >= week_ago
        ).count()

        # Check for flagged workouts
        has_flagged = db.query(WorkoutLog).filter(
            WorkoutLog.athlete_id == athlete.id,
            WorkoutLog.is_flagged == True
        ).first() is not None

        # Determine status
        if has_flagged:
            status = "flagged"
        elif last_log is None:
            status = "new"
        elif last_log.created_at >= three_days_ago:
            status = "active"
        else:
            status = "idle"

        # Get workout name for last log
        last_workout_name = None
        last_workout_date = None
        if last_log:
            workout = db.query(Workout).filter(Workout.id == last_log.workout_id).first()
            last_workout_name = workout.name if workout else "Unknown"
            last_workout_date = last_log.created_at

        statuses.append(AthleteStatus(
            id=athlete.id,
            name=athlete.name,
            profile_photo_url=athlete.profile_photo_url,
            sport=athlete.sport,
            status=status,
            last_workout_name=last_workout_name,
            last_workout_date=last_workout_date,
            workouts_this_week=week_logs,
            has_flagged=has_flagged,
        ))

    # Sort: flagged first, then active, then idle, then new
    status_order = {"flagged": 0, "active": 1, "idle": 2, "new": 3}
    statuses.sort(key=lambda s: status_order.get(s.status, 4))

    return AthleteStatusListResponse(athletes=statuses)

@router.post("/invite", response_model=InviteLinkResponse)
def create_invite_link(
    current_coach: User = Depends(get_current_coach)
):
    invite_link = f"freeweight://invite?coach_id={current_coach.id}"
    return InviteLinkResponse(
        invite_link=invite_link,
        coach_id=current_coach.id
    )

@router.post("/groups", response_model=GroupBasic)
def create_group(
    group_data: GroupCreate,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    try:
        group_invite_code = _generate_unique_group_code(db)

        new_group = Group(
            coach_id=current_coach.id,
            name=group_data.name,
            sport=group_data.sport,
            invite_code=group_invite_code
        )
        db.add(new_group)
        db.commit()
        db.refresh(new_group)

        return GroupBasic(id=new_group.id, name=new_group.name)
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Failed to create group: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create group: {str(e)}")

@router.post("/groups/{group_id}/subgroups", response_model=SubgroupBasic)
def create_subgroup(
    group_id: int,
    subgroup_data: SubgroupCreate,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    group = db.query(Group).filter(
        Group.id == group_id,
        Group.coach_id == current_coach.id
    ).first()

    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    new_subgroup = Subgroup(
        group_id=group_id,
        name=subgroup_data.name,
        training_focus=subgroup_data.training_focus
    )
    db.add(new_subgroup)
    db.commit()
    db.refresh(new_subgroup)

    return SubgroupBasic(
        id=new_subgroup.id,
        name=new_subgroup.name,
        training_focus=new_subgroup.training_focus
    )


@router.post("/groups/{group_id}/athletes/{athlete_id}")
def add_athlete_to_group(
    group_id: int,
    athlete_id: int,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    """Add an athlete to a group."""
    group = db.query(Group).filter(
        Group.id == group_id,
        Group.coach_id == current_coach.id
    ).first()

    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    athlete = db.query(User).filter(User.id == athlete_id).first()
    if not athlete or athlete not in current_coach.coached_athletes:
        raise HTTPException(status_code=404, detail="Athlete not found in your roster")

    if athlete not in group.members:
        group.members.append(athlete)
        db.commit()

    return {"message": "Athlete added to group successfully"}

@router.delete("/groups/{group_id}/athletes/{athlete_id}")
def remove_athlete_from_group(
    group_id: int,
    athlete_id: int,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    """Remove an athlete from a group."""
    group = db.query(Group).filter(
        Group.id == group_id,
        Group.coach_id == current_coach.id
    ).first()

    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    athlete = db.query(User).filter(User.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    if athlete in group.members:
        group.members.remove(athlete)
        db.commit()

    return {"message": "Athlete removed from group successfully"}

@router.get("/groups")
def get_groups(
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    """Get all groups for the current coach."""
    groups = db.query(Group).filter(Group.coach_id == current_coach.id).all()

    return [{
        "id": g.id,
        "name": g.name,
        "sport": g.sport,
        "invite_code": g.invite_code,
        "member_count": len(g.members),
        "subgroups": [{
            "id": s.id,
            "name": s.name,
            "training_focus": s.training_focus,
            "member_count": len(s.members)
        } for s in g.subgroups]
    } for g in groups]

@router.delete("/groups/{group_id}")
def delete_group(
    group_id: int,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    """Delete a group belonging to the current coach."""
    group = db.query(Group).filter(
        Group.id == group_id,
        Group.coach_id == current_coach.id
    ).first()

    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Remove program assignments referencing this group
    db.query(ProgramAssignment).filter(ProgramAssignment.group_id == group_id).delete()

    # Remove all group members
    db.execute(group_members.delete().where(group_members.c.group_id == group_id))

    db.delete(group)
    db.commit()

    return {"message": "Group deleted successfully"}

@router.get("/onboarding-settings")
def get_onboarding_settings(
    current_coach: User = Depends(get_current_coach),
):
    """Get the coach's onboarding skip fields."""
    skip_fields = []
    if current_coach.coach_onboarding_skip_fields:
        skip_fields = json.loads(current_coach.coach_onboarding_skip_fields)
    return {"skip_fields": skip_fields}


@router.put("/onboarding-settings")
def update_onboarding_settings(
    data: dict,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    """Set which onboarding fields athletes should skip."""
    skip_fields = data.get("skip_fields", [])
    current_coach.coach_onboarding_skip_fields = json.dumps(skip_fields)
    db.commit()
    return {"skip_fields": skip_fields}


@router.get("/onboarding-config/{invite_code}")
def get_onboarding_config(
    invite_code: str,
    db: Session = Depends(get_db)
):
    """Public endpoint — returns onboarding config for a coach or group invite code."""
    code = invite_code.upper()
    coach = db.query(User).filter(User.invite_code == code).first()
    if not coach:
        # Try group invite code
        group = db.query(Group).filter(Group.invite_code == code).first()
        if group:
            coach = db.query(User).filter(User.id == group.coach_id).first()
    if not coach:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    skip_fields = []
    if coach.coach_onboarding_skip_fields:
        skip_fields = json.loads(coach.coach_onboarding_skip_fields)
    return {"skip_fields": skip_fields, "coach_name": coach.name}

@router.get("/athletes/{athlete_id}")
def get_athlete_detail(
    athlete_id: int,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    athlete = db.query(User).filter(User.id == athlete_id).first()
    if not athlete or athlete not in current_coach.coached_athletes:
        raise HTTPException(status_code=404, detail="Athlete not found in your roster")

    maxes = db.query(AthleteMax).filter(
        AthleteMax.athlete_id == athlete_id
    ).order_by(AthleteMax.exercise_name).all()

    recent_logs = db.query(WorkoutLog).filter(
        WorkoutLog.athlete_id == athlete_id
    ).order_by(WorkoutLog.created_at.desc()).limit(10).all()

    log_data = []
    for log in recent_logs:
        workout = db.query(Workout).filter(Workout.id == log.workout_id).first()
        log_data.append({
            "id": log.id,
            "workout_name": workout.name if workout else "Unknown",
            "scheduled_date": (workout.scheduled_date if workout else log.created_at).isoformat(),
            "completed_at": log.completed_at.isoformat() if log.completed_at else None,
            "is_completed": log.is_completed,
            "has_modifications": log.has_modifications,
            "notes": log.notes,
            "is_flagged": log.is_flagged,
            "flag_reason": log.flag_reason,
            "coach_acknowledged": log.coach_acknowledged or False,
            "coach_response": log.coach_response,
        })

    return {
        "id": athlete.id,
        "name": athlete.name,
        "email": athlete.email,
        "sport": athlete.sport,
        "team": athlete.team,
        "training_goals": athlete.training_goals,
        "injuries": athlete.injuries,
        "maxes": [
            {"id": m.id, "exercise_name": m.exercise_name, "max_weight": m.max_weight, "unit": m.unit, "recorded_at": m.recorded_at.isoformat(), "updated_at": (m.updated_at or m.recorded_at).isoformat()}
            for m in maxes
        ],
        "recent_workouts": log_data,
    }


@router.get("/athletes/{athlete_id}/workouts/{workout_log_id}/summary")
def get_athlete_workout_summary(
    athlete_id: int,
    workout_log_id: int,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db),
):
    athlete = db.query(User).filter(User.id == athlete_id).first()
    if not athlete or athlete not in current_coach.coached_athletes:
        raise HTTPException(status_code=404, detail="Athlete not found in your roster")

    log = db.query(WorkoutLog).filter(
        WorkoutLog.id == workout_log_id,
        WorkoutLog.athlete_id == athlete_id,
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="Workout log not found")

    workout = db.query(Workout).filter(Workout.id == log.workout_id).first()
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")

    set_logs = db.query(SetLog).filter(SetLog.workout_log_id == log.id).all()
    sets_by_exercise: dict[int, list[SetLog]] = {}
    for sl in set_logs:
        sets_by_exercise.setdefault(sl.exercise_id, []).append(sl)

    exercises_payload = []
    for exercise in sorted(workout.exercises, key=lambda e: e.order):
        logs = sorted(
            sets_by_exercise.get(exercise.id, []),
            key=lambda s: s.set_number,
        )
        exercises_payload.append({
            "id": exercise.id,
            "name": exercise.name,
            "group_label": exercise.group_label,
            "sets": exercise.sets,
            "reps": exercise.reps,
            "set_logs": [
                {
                    "set_number": s.set_number,
                    "weight_used": s.weight_used,
                    "reps_completed": s.reps_completed,
                    "was_modified": s.was_modified or False,
                }
                for s in logs
            ],
        })

    return {
        "workout_log_id": log.id,
        "workout_name": workout.name,
        "completed_at": log.completed_at.isoformat() if log.completed_at else None,
        "notes": log.notes,
        "is_flagged": log.is_flagged or False,
        "flag_reason": log.flag_reason,
        "coach_response": log.coach_response,
        "exercises": exercises_payload,
    }


class AcknowledgeRequest(BaseModel):
    coach_response: Optional[str] = None


@router.post("/workout-logs/{log_id}/acknowledge")
def acknowledge_workout_log(
    log_id: int,
    data: AcknowledgeRequest,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    log = db.query(WorkoutLog).filter(WorkoutLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Workout log not found")

    # Verify the log belongs to one of this coach's athletes
    athlete_ids = [a.id for a in current_coach.coached_athletes]
    if log.athlete_id not in athlete_ids:
        raise HTTPException(status_code=403, detail="Not authorized to acknowledge this workout log")

    log.coach_acknowledged = True
    log.coach_response = data.coach_response
    log.acknowledged_at = datetime.utcnow()
    db.commit()

    return {"message": "Workout log acknowledged"}


# ─── Notifications ────────────────────────────────────────────────────────────

@router.get("/notifications", response_model=List[NotificationResponse])
def get_notifications(
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    """Return all notifications for the current coach, newest first."""
    notifications = db.query(Notification).filter(
        Notification.coach_id == current_coach.id
    ).order_by(Notification.created_at.desc()).all()

    result = []
    for n in notifications:
        athlete = db.query(User).filter(User.id == n.athlete_id).first()
        program_name = None
        if n.program_id:
            program = db.query(Program).filter(Program.id == n.program_id).first()
            program_name = program.name if program else None

        body_region = None
        body_region_detail = None
        if n.workout_log_id:
            log = db.query(WorkoutLog).filter(WorkoutLog.id == n.workout_log_id).first()
            if log:
                body_region = log.body_region
                body_region_detail = log.body_region_detail

        result.append(NotificationResponse(
            id=n.id,
            athlete_id=n.athlete_id,
            athlete_name=athlete.name if athlete else "Unknown",
            workout_log_id=n.workout_log_id,
            program_id=n.program_id,
            program_name=program_name,
            message=n.message,
            notification_type=n.notification_type,
            confidence=n.confidence,
            candidate_programs=n.candidate_programs,
            is_read=n.is_read,
            created_at=n.created_at,
            body_region=body_region,
            body_region_detail=body_region_detail,
        ))

    return result


@router.get("/notifications/unread-count")
def get_unread_notification_count(
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    """Return count of unread notifications for the current coach."""
    count = db.query(Notification).filter(
        Notification.coach_id == current_coach.id,
        Notification.is_read == False
    ).count()
    return {"count": count}


@router.patch("/notifications/read-all")
def mark_all_notifications_read(
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    """Mark all notifications for the current coach as read."""
    updated = db.query(Notification).filter(
        Notification.coach_id == current_coach.id,
        Notification.is_read == False
    ).all()
    for n in updated:
        n.is_read = True
    db.commit()
    return {"count": len(updated)}


@router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    """Mark a single notification as read."""
    notification = db.query(Notification).filter(
        Notification.id == notification_id
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.coach_id != current_coach.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    notification.is_read = True
    db.commit()
    return {"message": "Notification marked as read"}


# ─── Rehab Programs (lightweight list for reassignment picker) ───────────────

@router.get("/rehab-programs")
def list_rehab_programs(
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    """Return all non-archived rehab programs for the current coach."""
    programs = db.query(Program).filter(
        Program.coach_id == current_coach.id,
        Program.program_type == "rehab",
        Program.archived == False,
    ).order_by(Program.name).all()

    return [
        {"id": p.id, "name": p.name, "description": p.description}
        for p in programs
    ]


class ReassignRequest(BaseModel):
    new_program_id: int


@router.patch("/notifications/{notification_id}/reassign")
def reassign_notification_program(
    notification_id: int,
    data: ReassignRequest,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    """Swap the auto-assigned rehab program on a notification for a different one."""
    notification = db.query(Notification).filter(
        Notification.id == notification_id
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.coach_id != current_coach.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if notification.program_id is None:
        raise HTTPException(status_code=400, detail="Notification has no auto-assigned program to replace")

    new_program = db.query(Program).filter(
        Program.id == data.new_program_id,
        Program.coach_id == current_coach.id,
        Program.program_type == "rehab",
    ).first()
    if not new_program:
        raise HTTPException(status_code=404, detail="Rehab program not found or does not belong to you")

    # Delete existing assignment for this athlete + old program
    db.query(ProgramAssignment).filter(
        ProgramAssignment.program_id == notification.program_id,
        ProgramAssignment.athlete_id == notification.athlete_id,
    ).delete(synchronize_session=False)

    # Create new assignment
    db.add(ProgramAssignment(
        program_id=new_program.id,
        athlete_id=notification.athlete_id,
        start_date=datetime.now(timezone.utc),
    ))

    # Update notification
    notification.program_id = new_program.id
    notification.notification_type = "rehab_assigned"

    db.commit()

    return {
        "message": "Program reassigned successfully",
        "new_program_id": new_program.id,
        "new_program_name": new_program.name,
    }


# ─── Program Import (from AI parse) ───────────────────────────────────────────

class ImportExercise(BaseModel):
    name: str
    sets: int
    reps: int
    coach_notes: Optional[str] = None
    order: int
    rest_seconds: Optional[int] = None
    group_label: Optional[str] = None
    video_url: Optional[str] = None


class ImportWorkout(BaseModel):
    name: str
    day_offset: int = 0
    week_number: Optional[int] = None
    day_label: Optional[str] = None
    description: Optional[str] = None
    exercises: List[ImportExercise]


class ImportProgramRequest(BaseModel):
    program_name: str
    description: Optional[str] = None
    workouts: List[ImportWorkout]
    program_type: Optional[str] = "strength"
    body_regions: Optional[List[str]] = None
    num_weeks: Optional[int] = 1
    day_mode: Optional[str] = "offset"
    folder_id: Optional[int] = None
    is_ongoing: Optional[bool] = False
    same_every_week: Optional[bool] = False


@router.post("/programs/import")
def import_program(
    data: ImportProgramRequest,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db),
):
    """Save a workout program (from manual create or AI parse) to the database."""
    try:
        program = Program(
            name=data.program_name,
            description=data.description,
            coach_id=current_coach.id,
            program_type=data.program_type or "strength",
            body_regions=data.body_regions or None,
            num_weeks=data.num_weeks if not data.is_ongoing else None,
            day_mode=data.day_mode or "offset",
            folder_id=data.folder_id,
            is_ongoing=data.is_ongoing or False,
            same_every_week=data.same_every_week or False,
        )
        db.add(program)
        db.flush()  # get program.id before creating workouts

        exercise_count = 0
        now = datetime.now(timezone.utc)

        for w_data in data.workouts:
            workout = Workout(
                program_id=program.id,
                name=w_data.name,
                day_offset=w_data.day_offset,
                week_number=w_data.week_number,
                day_label=w_data.day_label,
                description=w_data.description,
                scheduled_date=now + timedelta(days=w_data.day_offset),
            )
            db.add(workout)
            db.flush()  # get workout.id before creating exercises

            for e_data in w_data.exercises:
                exercise = Exercise(
                    workout_id=workout.id,
                    name=e_data.name,
                    sets=e_data.sets,
                    reps=e_data.reps,
                    coach_notes=e_data.coach_notes,
                    order=e_data.order,
                    rest_seconds=e_data.rest_seconds,
                    group_label=e_data.group_label,
                    video_url=e_data.video_url,
                )
                db.add(exercise)
                exercise_count += 1

        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "import_program failed for coach %s, program_name=%r, %d workouts",
            current_coach.id, data.program_name, len(data.workouts),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to save program. Check server logs for details.",
        )

    return {
        "program_id": program.id,
        "program_name": program.name,
        "workout_count": len(data.workouts),
        "exercise_count": exercise_count,
    }
