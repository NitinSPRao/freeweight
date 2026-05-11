from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, date, timedelta, timezone
from typing import Optional
import base64
import json
import logging
from google import genai
from ..database import get_db
from ..auth import get_current_athlete
from .. import models
from ..config import settings

logger = logging.getLogger(__name__)
from ..schemas.athlete import (
    OnboardingRequest, MaxUpdate, CalendarWorkout, CalendarExerciseSummary,
    ProgressResponse, ProgressDataPoint, StrengthGoalResponse,
    StrengthGoalCreate, StrengthGoalUpdate, JoinCoachRequest,
    GenerateProgramRequest, CreateWorkoutRequest, CopyWorkoutRequest
)
from ..schemas.workout import WorkoutResponse, ExerciseResponse, SetLogCreate, WorkoutComplete, FlagRequest, WorkoutLogResponse, WorkoutEdit
from .programs import _materialize_program_for_athlete

router = APIRouter(prefix="/api/athletes", tags=["athletes"])


def _build_workout_response(workout: models.Workout, current_athlete: models.User, db: Session) -> WorkoutResponse:
    """Build a WorkoutResponse with auto-calculated target weights."""
    athlete_maxes = {m.exercise_name: m.max_weight for m in current_athlete.maxes}

    exercises = []
    for exercise in sorted(workout.exercises, key=lambda e: e.order):
        target_weight = None
        if exercise.percentage_of_max and exercise.target_exercise:
            max_weight = athlete_maxes.get(exercise.target_exercise)
            if max_weight:
                target_weight = round(max_weight * exercise.percentage_of_max, 2)

        exercises.append(ExerciseResponse(
            id=exercise.id,
            name=exercise.name,
            sets=exercise.sets,
            reps=exercise.reps,
            percentage_of_max=exercise.percentage_of_max,
            target_exercise=exercise.target_exercise,
            target_weight=target_weight,
            video_url=exercise.video_url,
            coach_notes=exercise.coach_notes,
            order=exercise.order
        ))

    workout_log = db.query(models.WorkoutLog).filter(
        and_(
            models.WorkoutLog.workout_id == workout.id,
            models.WorkoutLog.athlete_id == current_athlete.id
        )
    ).first()

    return WorkoutResponse(
        id=workout.id,
        name=workout.name,
        scheduled_date=workout.scheduled_date,
        description=workout.description,
        exercises=exercises,
        workout_log_id=workout_log.id if workout_log else None,
        is_completed=workout_log.is_completed if workout_log else False,
        is_flagged=workout_log.is_flagged if workout_log else False,
        athlete_modified=workout.athlete_modified or False,
        modification_notes=workout.modification_notes
    )


@router.post("/onboarding")
def complete_onboarding(
    data: OnboardingRequest,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    try:
        current_athlete.sport = data.sport
        current_athlete.team = data.team
        current_athlete.training_goals = data.training_goals
        current_athlete.injuries = data.injuries
        current_athlete.experience_level = data.experience_level
        current_athlete.onboarding_completed = True

        if data.maxes:
            for exercise_name, max_weight in data.maxes.items():
                existing = db.query(models.AthleteMax).filter(
                    and_(
                        models.AthleteMax.athlete_id == current_athlete.id,
                        models.AthleteMax.exercise_name == exercise_name
                    )
                ).first()
                if existing:
                    existing.max_weight = max_weight
                else:
                    db.add(models.AthleteMax(
                        athlete_id=current_athlete.id,
                        exercise_name=exercise_name,
                        max_weight=max_weight,
                        unit="lbs"
                    ))

        if data.goals:
            for exercise_name, goal_data in data.goals.items():
                target_weight = goal_data.get("target_weight")
                target_date_str = goal_data.get("target_date")
                if target_weight and target_date_str:
                    starting_weight = 0.0
                    if data.maxes and exercise_name in data.maxes:
                        starting_weight = data.maxes[exercise_name]
                    db.add(models.StrengthGoal(
                        athlete_id=current_athlete.id,
                        goal_type="lift",
                        exercise_name=exercise_name,
                        starting_weight=starting_weight,
                        target_weight=float(target_weight),
                        target_date=datetime.fromisoformat(target_date_str)
                    ))

        if not data.has_coach:
            _generate_starter_program(current_athlete, data, db)

        db.commit()
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        logger.exception(
            "complete_onboarding failed for athlete %s (has_coach=%s, goals=%s, maxes=%s)",
            current_athlete.id, data.has_coach,
            list((data.goals or {}).keys()), list((data.maxes or {}).keys()),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to complete onboarding. Check server logs for details.",
        )

    return {"message": "Onboarding completed successfully"}


def _generate_starter_program(athlete: models.User, data: OnboardingRequest, db: Session, weeks: int = 1):
    """Generate a starter training program based on athlete goals and experience."""
    goals = (data.training_goals or "").lower()
    level = (data.experience_level or "beginner").lower()
    injuries = (data.injuries or "").lower()

    if "strength" in goals:
        program_name = "Strength Builder"
        program_desc = "A compound-focused strength program to build your maxes."
        workouts = _strength_template(level)
    elif "hypertrophy" in goals or "muscle" in goals or "size" in goals:
        program_name = "Hypertrophy Program"
        program_desc = "A volume-focused program to maximize muscle growth."
        workouts = _hypertrophy_template(level)
    elif "sport" in goals or "athletic" in goals or "performance" in goals:
        program_name = "Athletic Performance"
        program_desc = "A balanced program for sport-specific power and conditioning."
        workouts = _athletic_template(level)
    else:
        program_name = "General Fitness"
        program_desc = "A well-rounded full-body program to build a strong foundation."
        workouts = _general_template(level)

    if injuries:
        workouts = _filter_for_injuries(workouts, injuries)

    program = models.Program(
        coach_id=athlete.id,
        name=program_name,
        description=program_desc
    )
    db.add(program)
    db.flush()

    today = datetime.utcnow().date()
    week_length = len(workouts)

    for week in range(weeks):
        pct_bump = 0.025 * week  # Progressive overload: +2.5% per week
        for day_idx, workout_data in enumerate(workouts):
            day_offset = week * week_length + day_idx
            scheduled = datetime(today.year, today.month, today.day) + timedelta(days=day_offset)

            # Deload week every 4th week
            is_deload = (week > 0 and (week + 1) % 4 == 0)

            desc = workout_data.get("description", "")
            if is_deload:
                desc = f"Deload week — lighter loads for recovery. {desc}"

            workout = models.Workout(
                program_id=program.id,
                athlete_id=athlete.id,
                name=workout_data["name"],
                description=desc or None,
                scheduled_date=scheduled,
                day_offset=day_offset
            )
            db.add(workout)
            db.flush()

            for order, ex in enumerate(workout_data["exercises"], 1):
                pct = ex.get("percentage")
                if pct and not is_deload:
                    pct = min(pct + pct_bump, 0.95)
                elif pct and is_deload:
                    pct = pct * 0.7  # 70% of normal for deload

                db.add(models.Exercise(
                    workout_id=workout.id,
                    name=ex["name"],
                    sets=ex["sets"],
                    reps=ex["reps"],
                    percentage_of_max=pct,
                    target_exercise=ex.get("target"),
                    coach_notes=ex.get("notes"),
                    order=order
                ))

    return program


def _strength_template(level: str) -> list[dict]:
    pct = {"beginner": 0.65, "intermediate": 0.75, "advanced": 0.85}.get(level, 0.65)
    pct2 = pct + 0.05
    return [
        {"name": "Day 1 — Squat Focus", "description": "Primary squat day — build lower body strength with compound movements.", "exercises": [
            {"name": "Back Squat", "sets": 5, "reps": 5, "percentage": pct2, "target": "squat"},
            {"name": "Romanian Deadlift", "sets": 3, "reps": 8, "percentage": 0.55, "target": "deadlift"},
            {"name": "Leg Press", "sets": 3, "reps": 10},
            {"name": "Plank", "sets": 3, "reps": 60, "notes": "Hold for 60 seconds"},
        ]},
        {"name": "Day 2 — Bench Focus", "description": "Primary bench day — build upper body pressing strength.", "exercises": [
            {"name": "Bench Press", "sets": 5, "reps": 5, "percentage": pct2, "target": "bench"},
            {"name": "Overhead Press", "sets": 3, "reps": 8, "percentage": 0.60, "target": "bench"},
            {"name": "Barbell Row", "sets": 4, "reps": 8},
            {"name": "Tricep Dips", "sets": 3, "reps": 10},
        ]},
        {"name": "Day 3 — Rest", "description": "Active recovery — light movement to promote blood flow and recovery.", "exercises": [
            {"name": "Light Cardio / Mobility", "sets": 1, "reps": 1, "notes": "20-30 min easy cardio or stretching"},
        ]},
        {"name": "Day 4 — Deadlift Focus", "description": "Primary deadlift day — build posterior chain strength.", "exercises": [
            {"name": "Deadlift", "sets": 5, "reps": 3, "percentage": pct2, "target": "deadlift"},
            {"name": "Front Squat", "sets": 3, "reps": 6, "percentage": 0.60, "target": "squat"},
            {"name": "Pull-Ups", "sets": 4, "reps": 8},
            {"name": "Hanging Leg Raise", "sets": 3, "reps": 12},
        ]},
        {"name": "Day 5 — Accessory", "description": "Accessory work — address weak points and build muscular balance.", "exercises": [
            {"name": "Incline Dumbbell Press", "sets": 3, "reps": 10},
            {"name": "Dumbbell Lunges", "sets": 3, "reps": 12},
            {"name": "Face Pulls", "sets": 3, "reps": 15},
            {"name": "Farmer's Walk", "sets": 3, "reps": 1, "notes": "40m per set"},
        ]},
    ]


def _hypertrophy_template(level: str) -> list[dict]:
    base_sets = {"beginner": 3, "intermediate": 4, "advanced": 4}.get(level, 3)
    return [
        {"name": "Day 1 — Push", "description": "Push day — chest, shoulders, and triceps volume.", "exercises": [
            {"name": "Bench Press", "sets": base_sets, "reps": 10, "percentage": 0.65, "target": "bench"},
            {"name": "Incline Dumbbell Press", "sets": base_sets, "reps": 12},
            {"name": "Overhead Press", "sets": base_sets, "reps": 10},
            {"name": "Cable Flyes", "sets": 3, "reps": 15},
            {"name": "Lateral Raises", "sets": 3, "reps": 15},
            {"name": "Tricep Pushdowns", "sets": 3, "reps": 12},
        ]},
        {"name": "Day 2 — Pull", "description": "Pull day — back and biceps volume.", "exercises": [
            {"name": "Barbell Row", "sets": base_sets, "reps": 10},
            {"name": "Pull-Ups", "sets": base_sets, "reps": 8},
            {"name": "Seated Cable Row", "sets": 3, "reps": 12},
            {"name": "Face Pulls", "sets": 3, "reps": 15},
            {"name": "Barbell Curl", "sets": 3, "reps": 12},
            {"name": "Hammer Curls", "sets": 3, "reps": 12},
        ]},
        {"name": "Day 3 — Legs", "description": "Leg day — quad, hamstring, and calf development.", "exercises": [
            {"name": "Back Squat", "sets": base_sets, "reps": 10, "percentage": 0.65, "target": "squat"},
            {"name": "Romanian Deadlift", "sets": base_sets, "reps": 10, "percentage": 0.55, "target": "deadlift"},
            {"name": "Leg Press", "sets": 3, "reps": 12},
            {"name": "Leg Curl", "sets": 3, "reps": 12},
            {"name": "Calf Raises", "sets": 4, "reps": 15},
        ]},
        {"name": "Day 4 — Rest", "description": "Recovery day — light cardio and stretching.", "exercises": [
            {"name": "Light Cardio / Stretching", "sets": 1, "reps": 1, "notes": "20-30 min recovery"},
        ]},
        {"name": "Day 5 — Upper", "description": "Upper body volume — shoulders, arms, and chest.", "exercises": [
            {"name": "Overhead Press", "sets": base_sets, "reps": 10},
            {"name": "Weighted Dips", "sets": base_sets, "reps": 10},
            {"name": "Dumbbell Row", "sets": 3, "reps": 12},
            {"name": "Lateral Raises", "sets": 3, "reps": 15},
            {"name": "Skull Crushers", "sets": 3, "reps": 12},
        ]},
        {"name": "Day 6 — Legs", "description": "Second leg day — variation and accessory work.", "exercises": [
            {"name": "Front Squat", "sets": base_sets, "reps": 8, "percentage": 0.60, "target": "squat"},
            {"name": "Walking Lunges", "sets": 3, "reps": 12},
            {"name": "Leg Extension", "sets": 3, "reps": 15},
            {"name": "Glute Bridge", "sets": 3, "reps": 12},
            {"name": "Calf Raises", "sets": 4, "reps": 15},
        ]},
    ]


def _athletic_template(level: str) -> list[dict]:
    pct = {"beginner": 0.60, "intermediate": 0.70, "advanced": 0.80}.get(level, 0.60)
    return [
        {"name": "Day 1 — Power", "description": "Explosive power development — Olympic lifts and plyometrics.", "exercises": [
            {"name": "Power Clean", "sets": 5, "reps": 3, "percentage": pct, "target": "clean"},
            {"name": "Back Squat", "sets": 4, "reps": 5, "percentage": pct, "target": "squat"},
            {"name": "Box Jumps", "sets": 4, "reps": 5, "notes": "Focus on explosive hip extension"},
            {"name": "Plank", "sets": 3, "reps": 45, "notes": "Hold for 45 seconds"},
        ]},
        {"name": "Day 2 — Upper Strength", "description": "Upper body strength for sport performance.", "exercises": [
            {"name": "Bench Press", "sets": 4, "reps": 6, "percentage": pct, "target": "bench"},
            {"name": "Weighted Pull-Ups", "sets": 4, "reps": 6},
            {"name": "Dumbbell Shoulder Press", "sets": 3, "reps": 8},
            {"name": "Medicine Ball Slams", "sets": 3, "reps": 10, "notes": "Explosive"},
        ]},
        {"name": "Day 3 — Conditioning", "description": "Sport-specific conditioning and agility work.", "exercises": [
            {"name": "Sprint Intervals", "sets": 8, "reps": 1, "notes": "30s sprint, 60s rest"},
            {"name": "Agility Ladder Drills", "sets": 4, "reps": 1, "notes": "Various patterns"},
            {"name": "Bodyweight Circuit", "sets": 3, "reps": 1, "notes": "10 push-ups, 10 squats, 10 burpees"},
        ]},
        {"name": "Day 4 — Lower Strength", "description": "Lower body strength and posterior chain development.", "exercises": [
            {"name": "Deadlift", "sets": 4, "reps": 5, "percentage": pct, "target": "deadlift"},
            {"name": "Bulgarian Split Squats", "sets": 3, "reps": 8},
            {"name": "Glute-Ham Raise", "sets": 3, "reps": 10},
            {"name": "Single-Leg Calf Raises", "sets": 3, "reps": 12},
        ]},
        {"name": "Day 5 — Sport Skills + Recovery", "description": "Active recovery with sport-specific skill work.", "exercises": [
            {"name": "Sport-Specific Drills", "sets": 1, "reps": 1, "notes": "30 min sport practice"},
            {"name": "Foam Rolling / Mobility", "sets": 1, "reps": 1, "notes": "20 min recovery"},
        ]},
    ]


def _general_template(level: str) -> list[dict]:
    pct = {"beginner": 0.60, "intermediate": 0.70, "advanced": 0.75}.get(level, 0.60)
    base_sets = {"beginner": 3, "intermediate": 3, "advanced": 4}.get(level, 3)
    return [
        {"name": "Day 1 — Full Body A", "description": "Full body session A — compound lifts for overall strength.", "exercises": [
            {"name": "Back Squat", "sets": base_sets, "reps": 8, "percentage": pct, "target": "squat"},
            {"name": "Bench Press", "sets": base_sets, "reps": 8, "percentage": pct, "target": "bench"},
            {"name": "Barbell Row", "sets": base_sets, "reps": 10},
            {"name": "Plank", "sets": 3, "reps": 45, "notes": "Hold for 45 seconds"},
        ]},
        {"name": "Day 2 — Cardio + Core", "description": "Cardiovascular conditioning and core stability.", "exercises": [
            {"name": "Cardio", "sets": 1, "reps": 1, "notes": "25-30 min moderate intensity"},
            {"name": "Russian Twists", "sets": 3, "reps": 20},
            {"name": "Dead Bug", "sets": 3, "reps": 12},
            {"name": "Stretching", "sets": 1, "reps": 1, "notes": "10 min full body stretch"},
        ]},
        {"name": "Day 3 — Full Body B", "description": "Full body session B — deadlift focus with pressing.", "exercises": [
            {"name": "Deadlift", "sets": base_sets, "reps": 6, "percentage": pct, "target": "deadlift"},
            {"name": "Overhead Press", "sets": base_sets, "reps": 8},
            {"name": "Pull-Ups", "sets": base_sets, "reps": 8},
            {"name": "Dumbbell Lunges", "sets": 3, "reps": 10},
        ]},
        {"name": "Day 4 — Rest", "description": "Active recovery — light walking and stretching.", "exercises": [
            {"name": "Light Walk / Stretching", "sets": 1, "reps": 1, "notes": "Active recovery"},
        ]},
        {"name": "Day 5 — Full Body C", "description": "Full body session C — front squat variation with accessories.", "exercises": [
            {"name": "Front Squat", "sets": base_sets, "reps": 8, "percentage": 0.55, "target": "squat"},
            {"name": "Incline Dumbbell Press", "sets": base_sets, "reps": 10},
            {"name": "Seated Cable Row", "sets": base_sets, "reps": 10},
            {"name": "Farmer's Walk", "sets": 3, "reps": 1, "notes": "40m per set"},
        ]},
    ]


def _filter_for_injuries(workouts: list[dict], injuries: str) -> list[dict]:
    """Remove exercises that may aggravate reported injuries."""
    skip_map = {
        "knee": ["Leg Press", "Leg Extension", "Box Jumps", "Walking Lunges", "Dumbbell Lunges", "Bulgarian Split Squats"],
        "shoulder": ["Overhead Press", "Dumbbell Shoulder Press", "Lateral Raises", "Weighted Dips"],
        "back": ["Deadlift", "Romanian Deadlift", "Barbell Row", "Power Clean"],
        "wrist": ["Power Clean", "Front Squat", "Barbell Curl"],
        "ankle": ["Box Jumps", "Sprint Intervals", "Agility Ladder Drills", "Calf Raises", "Single-Leg Calf Raises"],
        "hip": ["Bulgarian Split Squats", "Walking Lunges", "Dumbbell Lunges", "Glute Bridge", "Glute-Ham Raise"],
    }

    exercises_to_skip = set()
    for area, exercises in skip_map.items():
        if area in injuries:
            exercises_to_skip.update(exercises)

    filtered = []
    for workout in workouts:
        filtered_exercises = [ex for ex in workout["exercises"] if ex["name"] not in exercises_to_skip]
        if filtered_exercises:
            filtered.append({**workout, "exercises": filtered_exercises})
    return filtered


# ─── Max Lifts ────────────────────────────────────────────────────────────────

@router.put("/maxes")
def update_max(
    data: MaxUpdate,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    athlete_max = db.query(models.AthleteMax).filter(
        and_(
            models.AthleteMax.athlete_id == current_athlete.id,
            models.AthleteMax.exercise_name == data.exercise_name
        )
    ).first()

    if athlete_max:
        athlete_max.max_weight = data.max_weight
        athlete_max.unit = data.unit
        athlete_max.updated_at = datetime.utcnow()
    else:
        athlete_max = models.AthleteMax(
            athlete_id=current_athlete.id,
            exercise_name=data.exercise_name,
            max_weight=data.max_weight,
            unit=data.unit
        )
        db.add(athlete_max)

    db.commit()
    return {"message": "Max updated successfully"}


@router.delete("/maxes/{exercise_name}")
def delete_max(
    exercise_name: str,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    athlete_max = db.query(models.AthleteMax).filter(
        and_(
            models.AthleteMax.athlete_id == current_athlete.id,
            models.AthleteMax.exercise_name == exercise_name
        )
    ).first()

    if not athlete_max:
        raise HTTPException(status_code=404, detail="Max not found")

    db.delete(athlete_max)
    db.commit()
    return {"message": "Max deleted successfully"}


# ─── Strength Goals ───────────────────────────────────────────────────────────

@router.get("/goals", response_model=list[StrengthGoalResponse])
def get_goals(
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    goals = db.query(models.StrengthGoal).filter(
        models.StrengthGoal.athlete_id == current_athlete.id
    ).order_by(models.StrengthGoal.created_at.desc()).all()
    return goals


@router.post("/goals", response_model=StrengthGoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    data: StrengthGoalCreate,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    if data.goal_type == "lift":
        if not data.exercise_name or data.target_weight is None:
            raise HTTPException(status_code=400, detail="Lift goals require exercise_name and target_weight")

    goal = models.StrengthGoal(
        athlete_id=current_athlete.id,
        goal_type=data.goal_type,
        exercise_name=data.exercise_name,
        starting_weight=data.starting_weight,
        target_weight=data.target_weight,
        qualitative_goal=data.qualitative_goal,
        target_date=datetime.fromisoformat(data.target_date) if data.target_date else None
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.put("/goals/{goal_id}", response_model=StrengthGoalResponse)
def update_goal(
    goal_id: int,
    data: StrengthGoalUpdate,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    goal = db.query(models.StrengthGoal).filter(
        and_(
            models.StrengthGoal.id == goal_id,
            models.StrengthGoal.athlete_id == current_athlete.id
        )
    ).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    if data.exercise_name is not None:
        goal.exercise_name = data.exercise_name
    if data.starting_weight is not None:
        goal.starting_weight = data.starting_weight
    if data.target_weight is not None:
        goal.target_weight = data.target_weight
    if data.qualitative_goal is not None:
        goal.qualitative_goal = data.qualitative_goal
    if data.target_date is not None:
        goal.target_date = datetime.fromisoformat(data.target_date)
    if data.is_completed is not None:
        goal.is_completed = data.is_completed

    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/goals/{goal_id}")
def delete_goal(
    goal_id: int,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    goal = db.query(models.StrengthGoal).filter(
        and_(
            models.StrengthGoal.id == goal_id,
            models.StrengthGoal.athlete_id == current_athlete.id
        )
    ).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    db.delete(goal)
    db.commit()
    return {"message": "Goal deleted"}


@router.post("/goals/{goal_id}/complete")
def complete_goal(
    goal_id: int,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    goal = db.query(models.StrengthGoal).filter(
        and_(
            models.StrengthGoal.id == goal_id,
            models.StrengthGoal.athlete_id == current_athlete.id
        )
    ).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    goal.is_completed = True
    db.commit()
    return {"message": "Goal marked as completed"}


# ─── Join Coach ───────────────────────────────────────────────────────────────

@router.post("/join-coach")
def join_coach(
    data: JoinCoachRequest,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    coach = db.query(models.User).filter(
        models.User.invite_code == data.invite_code.upper()
    ).first()

    if not coach:
        raise HTTPException(status_code=400, detail="Invalid invite code")

    if current_athlete in coach.coached_athletes:
        raise HTTPException(status_code=409, detail="Already connected to this coach")

    coach.coached_athletes.append(current_athlete)
    db.commit()

    return {"message": f"Connected to coach {coach.name}", "coach_name": coach.name, "coach_id": coach.id}


# ─── Join Group ───────────────────────────────────────────────────────────────

@router.post("/join-group")
def join_group(
    data: dict,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    """Join a group using its invite code. Athlete must already belong to the group's coach."""
    invite_code = (data.get("invite_code") or "").upper()
    if not invite_code:
        raise HTTPException(status_code=400, detail="invite_code is required")

    group = db.query(models.Group).filter(models.Group.invite_code == invite_code).first()
    if not group:
        raise HTTPException(status_code=400, detail="Invalid group invite code")

    # Validate the athlete belongs to the same coach as the group
    coach = db.query(models.User).filter(models.User.id == group.coach_id).first()
    if not coach or current_athlete not in coach.coached_athletes:
        raise HTTPException(
            status_code=403,
            detail="You are not on this coach's roster. Join the coach first."
        )

    if current_athlete in group.members:
        raise HTTPException(status_code=409, detail="Already a member of this group")

    group.members.append(current_athlete)
    db.commit()

    return {"message": f"Joined group {group.name}", "group_name": group.name, "group_id": group.id}


# ─── Calendar ─────────────────────────────────────────────────────────────────

@router.get("/calendar", response_model=list[CalendarWorkout])
def get_calendar(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    query = db.query(models.Workout).filter(
        models.Workout.athlete_id == current_athlete.id
    )

    if start_date:
        query = query.filter(models.Workout.scheduled_date >= start_date)
    if end_date:
        query = query.filter(models.Workout.scheduled_date <= end_date)

    workouts = query.order_by(models.Workout.scheduled_date).all()

    calendar_workouts = []
    for workout in workouts:
        workout_log = db.query(models.WorkoutLog).filter(
            and_(
                models.WorkoutLog.workout_id == workout.id,
                models.WorkoutLog.athlete_id == current_athlete.id
            )
        ).first()

        exercises = [
            CalendarExerciseSummary(name=ex.name, sets=ex.sets, reps=ex.reps)
            for ex in sorted(workout.exercises, key=lambda e: e.order)
        ]

        calendar_workouts.append(CalendarWorkout(
            id=workout.id,
            name=workout.name,
            scheduled_date=workout.scheduled_date,
            is_completed=workout_log.is_completed if workout_log else False,
            is_flagged=workout_log.is_flagged if workout_log else False,
            rpe=workout_log.rpe if workout_log else None,
            description=workout.description,
            exercises=exercises
        ))

    return calendar_workouts


# ─── Workouts ─────────────────────────────────────────────────────────────────

@router.get("/workouts/today", response_model=WorkoutResponse)
def get_today_workout(
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    today = datetime.utcnow().date()
    today_start = datetime(today.year, today.month, today.day, 0, 0, 0)
    today_end = datetime(today.year, today.month, today.day, 23, 59, 59)

    workout = db.query(models.Workout).filter(
        and_(
            models.Workout.athlete_id == current_athlete.id,
            models.Workout.scheduled_date >= today_start,
            models.Workout.scheduled_date <= today_end
        )
    ).first()

    if not workout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No workout scheduled for today"
        )

    return _build_workout_response(workout, current_athlete, db)


@router.get("/workouts/{workout_id}", response_model=WorkoutResponse)
def get_workout(
    workout_id: int,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    workout = db.query(models.Workout).filter(
        and_(
            models.Workout.id == workout_id,
            models.Workout.athlete_id == current_athlete.id
        )
    ).first()

    if not workout:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")

    return _build_workout_response(workout, current_athlete, db)


@router.post("/workouts", response_model=WorkoutResponse)
def create_workout(
    data: CreateWorkoutRequest,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    """Create a self-programmed workout on a specific date."""
    scheduled = datetime.fromisoformat(data.scheduled_date)

    workout = models.Workout(
        athlete_id=current_athlete.id,
        name=data.name,
        description=data.description,
        scheduled_date=scheduled
    )
    db.add(workout)
    db.flush()

    for order, ex_data in enumerate(data.exercises, 1):
        db.add(models.Exercise(
            workout_id=workout.id,
            name=ex_data.get("name", "Exercise"),
            sets=ex_data.get("sets", 3),
            reps=ex_data.get("reps", 10),
            percentage_of_max=ex_data.get("percentage_of_max"),
            target_exercise=ex_data.get("target_exercise"),
            coach_notes=ex_data.get("coach_notes"),
            order=ex_data.get("order", order)
        ))

    db.commit()
    db.refresh(workout)
    return _build_workout_response(workout, current_athlete, db)


@router.post("/workouts/{workout_id}/copy", response_model=WorkoutResponse)
def copy_workout(
    workout_id: int,
    data: CopyWorkoutRequest,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    """Deep-copy a previous workout to a new date."""
    source = db.query(models.Workout).filter(
        and_(
            models.Workout.id == workout_id,
            models.Workout.athlete_id == current_athlete.id
        )
    ).first()

    if not source:
        raise HTTPException(status_code=404, detail="Workout not found")

    scheduled = datetime.fromisoformat(data.scheduled_date)

    new_workout = models.Workout(
        athlete_id=current_athlete.id,
        program_id=source.program_id,
        name=source.name,
        description=source.description,
        scheduled_date=scheduled
    )
    db.add(new_workout)
    db.flush()

    for ex in sorted(source.exercises, key=lambda e: e.order):
        db.add(models.Exercise(
            workout_id=new_workout.id,
            name=ex.name,
            sets=ex.sets,
            reps=ex.reps,
            percentage_of_max=ex.percentage_of_max,
            target_exercise=ex.target_exercise,
            video_url=ex.video_url,
            coach_notes=ex.coach_notes,
            order=ex.order
        ))

    db.commit()
    db.refresh(new_workout)
    return _build_workout_response(new_workout, current_athlete, db)


@router.put("/workouts/{workout_id}", response_model=WorkoutResponse)
def edit_workout(
    workout_id: int,
    data: WorkoutEdit,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    workout = db.query(models.Workout).filter(
        and_(
            models.Workout.id == workout_id,
            models.Workout.athlete_id == current_athlete.id
        )
    ).first()

    if not workout:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")

    if data.name is not None:
        workout.name = data.name

    if data.exercises is not None:
        for ex in workout.exercises:
            db.delete(ex)
        db.flush()

        for ex_data in data.exercises:
            db.add(models.Exercise(
                workout_id=workout.id,
                name=ex_data.name,
                sets=ex_data.sets,
                reps=ex_data.reps,
                percentage_of_max=ex_data.percentage_of_max,
                target_exercise=ex_data.target_exercise,
                coach_notes=ex_data.coach_notes,
                order=ex_data.order
            ))

    workout.athlete_modified = True
    workout.modification_notes = data.modification_notes

    db.commit()
    db.refresh(workout)
    return _build_workout_response(workout, current_athlete, db)


@router.post("/workouts/{workout_id}/start")
def start_workout(
    workout_id: int,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    workout = db.query(models.Workout).filter(
        and_(
            models.Workout.id == workout_id,
            models.Workout.athlete_id == current_athlete.id
        )
    ).first()

    if not workout:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")

    existing_log = db.query(models.WorkoutLog).filter(
        and_(
            models.WorkoutLog.workout_id == workout_id,
            models.WorkoutLog.athlete_id == current_athlete.id
        )
    ).first()

    if existing_log:
        return {"workout_log_id": existing_log.id, "message": "Workout already started"}

    workout_log = models.WorkoutLog(
        athlete_id=current_athlete.id,
        workout_id=workout_id,
        is_completed=False
    )
    db.add(workout_log)
    db.commit()
    db.refresh(workout_log)

    return {"workout_log_id": workout_log.id, "message": "Workout started"}


@router.post("/workouts/{workout_id}/sets")
def log_set(
    workout_id: int,
    data: SetLogCreate,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    workout_log = db.query(models.WorkoutLog).filter(
        and_(
            models.WorkoutLog.workout_id == workout_id,
            models.WorkoutLog.athlete_id == current_athlete.id
        )
    ).first()

    if not workout_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not started. Call /start first"
        )

    exercise = db.query(models.Exercise).filter(models.Exercise.id == data.exercise_id).first()
    if not exercise or exercise.workout_id != workout_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found in this workout"
        )

    set_log = models.SetLog(
        workout_log_id=workout_log.id,
        exercise_id=data.exercise_id,
        set_number=data.set_number,
        weight_used=data.weight_used,
        reps_completed=data.reps_completed,
        rpe=data.rpe,
        notes=data.notes,
        video_url=data.video_url,
        was_modified=data.was_modified
    )
    db.add(set_log)

    if data.was_modified:
        workout_log.has_modifications = True

    db.commit()
    return {"message": "Set logged successfully"}


@router.post("/workouts/{workout_id}/complete")
def complete_workout(
    workout_id: int,
    data: WorkoutComplete,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    workout_log = db.query(models.WorkoutLog).filter(
        and_(
            models.WorkoutLog.workout_id == workout_id,
            models.WorkoutLog.athlete_id == current_athlete.id
        )
    ).first()

    if not workout_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not started")

    workout_log.is_completed = True
    workout_log.completed_at = datetime.utcnow()
    if data.notes:
        workout_log.notes = data.notes
    if data.rpe is not None:
        workout_log.rpe = data.rpe

    db.commit()
    return {"message": "Workout completed successfully"}


@router.post("/workouts/{workout_id}/flag")
def flag_workout(
    workout_id: int,
    data: FlagRequest,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    workout_log = db.query(models.WorkoutLog).filter(
        and_(
            models.WorkoutLog.workout_id == workout_id,
            models.WorkoutLog.athlete_id == current_athlete.id
        )
    ).first()

    if not workout_log:
        workout_log = models.WorkoutLog(
            athlete_id=current_athlete.id,
            workout_id=workout_id,
            is_completed=False,
            is_flagged=True,
            flag_reason=data.reason,
            body_region=data.body_region,
            body_region_detail=data.body_region_detail,
            rehab_target=data.rehab_target,
        )
        db.add(workout_log)
        db.flush()  # get workout_log.id for notification FK before commit
    else:
        workout_log.is_flagged = True
        workout_log.flag_reason = data.reason
        workout_log.body_region = data.body_region
        workout_log.body_region_detail = data.body_region_detail
        workout_log.rehab_target = data.rehab_target

    # ─── Notification & rehab assignment (side effect — must not block flag) ──
    match_result = {
        "flagged": True,
        "matched": False,
        "program_name": None,
        "confidence": None,
    }
    try:
        coach = current_athlete.coaches[0] if current_athlete.coaches else None
        if coach:
            if data.opt_in_rehab:
                # ── Gemini semantic matching ──────────────────────────────────
                programs = db.query(models.Program).filter(
                    models.Program.coach_id == coach.id,
                    models.Program.program_type == "rehab",
                    models.Program.archived == False,
                ).all()

                if not programs:
                    db.add(models.Notification(
                        coach_id=coach.id,
                        athlete_id=current_athlete.id,
                        workout_log_id=workout_log.id,
                        program_id=None,
                        notification_type="injury_no_rehab",
                        confidence=None,
                        candidate_programs=None,
                        message=(
                            f"No rehab programs are available in your library. "
                            f"Please create a rehab program and assign it to "
                            f"{current_athlete.name} manually."
                        ),
                        is_read=False,
                    ))
                else:
                    athlete_description = data.rehab_target or data.reason

                    system_instruction = (
                        "You are a sports medicine assistant helping match an injured "
                        "athlete to the most appropriate rehab program from a coach's "
                        "library. Analyze the athlete's description and each program's "
                        "name and description to find the best match.\n\n"
                        "Return ONLY valid JSON. No markdown, no backticks, no preamble. "
                        "First character must be '{'."
                    )
                    program_lines = "\n".join(
                        f"ID: {p.id} | Name: {p.name} | Description: {p.description or 'No description provided'}"
                        for p in programs
                    )
                    user_message = (
                        f'Athlete\'s rehab target: "{athlete_description}"\n\n'
                        f"Available rehab programs:\n{program_lines}\n\n"
                        "Analyze each program and return:\n"
                        "{\n"
                        '  "best_match_id": integer or null,\n'
                        '  "confidence": "high" or "medium" or "low",\n'
                        '  "reasoning": "one sentence explanation",\n'
                        '  "candidate_ids": [list of program ids that were ambiguous — only for medium confidence, empty list otherwise]\n'
                        "}\n\n"
                        "Confidence rules:\n"
                        '- "high": one program clearly fits better than all others, even if the match is not word-for-word perfect. A partial match is still high confidence if no other program competes.\n'
                        '- "medium": two or more programs could reasonably fit and it is genuinely unclear which is better.\n'
                        '- "low": the description does not meaningfully relate to any available program, or is too vague to interpret.\n\n'
                        "If confidence is low, set best_match_id to null."
                    )

                    matched_result = None
                    try:
                        client = genai.Client(api_key=settings.gemini_api_key)
                        response = client.models.generate_content(
                            model="gemini-2.5-flash-lite",
                            contents=user_message,
                            config={"system_instruction": system_instruction},
                        )
                        raw = response.text.strip()
                        # Strip markdown fences if present
                        if raw.startswith("```"):
                            raw = raw.split("```")[1]
                            if raw.startswith("json"):
                                raw = raw[4:]
                        matched_result = json.loads(raw)
                    except Exception as gemini_err:
                        logger.error("Gemini matching failed: %s", gemini_err)

                    if matched_result is None:
                        db.add(models.Notification(
                            coach_id=coach.id,
                            athlete_id=current_athlete.id,
                            workout_log_id=workout_log.id,
                            program_id=None,
                            notification_type="injury_no_rehab",
                            confidence=None,
                            candidate_programs=None,
                            message=(
                                f"Matching service unavailable — please assign a rehab "
                                f"program to {current_athlete.name} manually."
                            ),
                            is_read=False,
                        ))
                    else:
                        confidence = matched_result.get("confidence", "low")
                        best_match_id = matched_result.get("best_match_id")
                        candidate_ids = matched_result.get("candidate_ids", [])

                        if confidence in ("high", "medium") and best_match_id is not None:
                            matched_program = db.query(models.Program).filter(
                                models.Program.id == best_match_id
                            ).first()

                            if matched_program:
                                _materialize_program_for_athlete(
                                    db=db,
                                    program_id=matched_program.id,
                                    athlete_id=current_athlete.id,
                                    start_date=datetime.now(timezone.utc),
                                )

                                if confidence == "high":
                                    match_result["matched"] = True
                                    match_result["program_name"] = matched_program.name
                                    match_result["confidence"] = "high"
                                    db.add(models.Notification(
                                        coach_id=coach.id,
                                        athlete_id=current_athlete.id,
                                        workout_log_id=workout_log.id,
                                        program_id=matched_program.id,
                                        notification_type="rehab_assigned",
                                        confidence="high",
                                        candidate_programs=[],
                                        message=(
                                            f"{current_athlete.name} requested a rehab plan targeting "
                                            f"'{athlete_description}'. "
                                            f"'{matched_program.name}' was automatically assigned."
                                        ),
                                        is_read=False,
                                    ))
                                else:  # medium
                                    match_result["matched"] = True
                                    match_result["program_name"] = matched_program.name
                                    match_result["confidence"] = "medium"
                                    candidate_program_names: list[str] = []
                                    if candidate_ids:
                                        candidate_objs = db.query(models.Program).filter(
                                            models.Program.id.in_(candidate_ids)
                                        ).all()
                                        candidate_program_names = [p.name for p in candidate_objs]

                                    db.add(models.Notification(
                                        coach_id=coach.id,
                                        athlete_id=current_athlete.id,
                                        workout_log_id=workout_log.id,
                                        program_id=matched_program.id,
                                        notification_type="rehab_assigned_review",
                                        confidence="medium",
                                        candidate_programs=candidate_program_names,
                                        message=(
                                            f"{current_athlete.name} requested a rehab plan targeting "
                                            f"'{athlete_description}'. "
                                            f"'{matched_program.name}' was assigned as the closest match. "
                                            f"Other possible matches: "
                                            f"{', '.join(candidate_program_names)}. "
                                            f"Review and reassign if needed."
                                        ),
                                        is_read=False,
                                    ))
                            else:
                                # best_match_id didn't resolve to a real program
                                match_result["confidence"] = "low"
                                db.add(models.Notification(
                                    coach_id=coach.id,
                                    athlete_id=current_athlete.id,
                                    workout_log_id=workout_log.id,
                                    program_id=None,
                                    notification_type="injury_no_rehab",
                                    confidence="low",
                                    candidate_programs=[],
                                    message=(
                                        f"{current_athlete.name} requested a rehab plan targeting "
                                        f"'{athlete_description}'. "
                                        f"A confident match could not be found. "
                                        f"Please assign a program manually."
                                    ),
                                    is_read=False,
                                ))
                        else:
                            # low confidence or null best_match_id
                            match_result["confidence"] = "low"
                            db.add(models.Notification(
                                coach_id=coach.id,
                                athlete_id=current_athlete.id,
                                workout_log_id=workout_log.id,
                                program_id=None,
                                notification_type="injury_no_rehab",
                                confidence="low",
                                candidate_programs=[],
                                message=(
                                    f"{current_athlete.name} requested a rehab plan targeting "
                                    f"'{athlete_description}'. "
                                    f"A confident match could not be found. "
                                    f"Please assign a program manually."
                                ),
                                is_read=False,
                            ))

            elif data.body_region:
                # Athlete flagged a body region but did not opt in to rehab
                region_label = models.BODY_REGION_LABELS.get(data.body_region, data.body_region)
                db.add(models.Notification(
                    coach_id=coach.id,
                    athlete_id=current_athlete.id,
                    workout_log_id=workout_log.id,
                    program_id=None,
                    notification_type="injury_no_rehab",
                    confidence=None,
                    candidate_programs=None,
                    message=(
                        f"{current_athlete.name} flagged a {region_label} issue "
                        f"but did not request a rehab program."
                    ),
                    is_read=False,
                ))
            else:
                # No body region and no opt-in
                db.add(models.Notification(
                    coach_id=coach.id,
                    athlete_id=current_athlete.id,
                    workout_log_id=workout_log.id,
                    program_id=None,
                    notification_type="injury_no_rehab",
                    confidence=None,
                    candidate_programs=None,
                    message=(
                        f"{current_athlete.name} flagged a workout "
                        f"but did not specify a body region. "
                        f"Please follow up manually."
                    ),
                    is_read=False,
                ))
    except Exception as e:
        logger.error(
            "Notification/rehab logic failed for athlete %s workout_log %s: %s",
            current_athlete.id, workout_log.id, e,
        )

    db.commit()
    return match_result


# ─── History & Progress ───────────────────────────────────────────────────────

@router.get("/history", response_model=list[WorkoutLogResponse])
def get_history(
    limit: int = 50,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    workout_logs = db.query(models.WorkoutLog).filter(
        models.WorkoutLog.athlete_id == current_athlete.id
    ).order_by(models.WorkoutLog.created_at.desc()).limit(limit).all()

    response = []
    for log in workout_logs:
        workout = db.query(models.Workout).filter(models.Workout.id == log.workout_id).first()
        response.append(WorkoutLogResponse(
            id=log.id,
            workout_id=log.workout_id,
            workout_name=workout.name if workout else "Unknown",
            scheduled_date=workout.scheduled_date if workout else log.created_at,
            completed_at=log.completed_at,
            is_completed=log.is_completed,
            has_modifications=log.has_modifications,
            is_flagged=log.is_flagged,
            flag_reason=log.flag_reason,
            rpe=log.rpe
        ))

    return response


@router.get("/progress", response_model=list[ProgressResponse])
def get_progress(
    exercise_name: Optional[str] = None,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    query = db.query(models.AthleteMax).filter(
        models.AthleteMax.athlete_id == current_athlete.id
    )

    if exercise_name:
        query = query.filter(models.AthleteMax.exercise_name == exercise_name)

    maxes = query.order_by(models.AthleteMax.exercise_name, models.AthleteMax.recorded_at).all()

    progress_by_exercise: dict[str, list[ProgressDataPoint]] = {}
    current_maxes: dict[str, float] = {}
    for max_record in maxes:
        if max_record.exercise_name not in progress_by_exercise:
            progress_by_exercise[max_record.exercise_name] = []
        progress_by_exercise[max_record.exercise_name].append(
            ProgressDataPoint(
                date=max_record.recorded_at,
                max_weight=max_record.max_weight
            )
        )
        current_maxes[max_record.exercise_name] = max_record.max_weight

    # Fetch strength goals (lift-type only for progress view)
    goals_query = db.query(models.StrengthGoal).filter(
        models.StrengthGoal.athlete_id == current_athlete.id,
        models.StrengthGoal.goal_type == "lift"
    )
    if exercise_name:
        goals_query = goals_query.filter(models.StrengthGoal.exercise_name == exercise_name)
    goals = {g.exercise_name: g for g in goals_query.all()}

    all_exercises = set(progress_by_exercise.keys()) | set(goals.keys())

    return [
        ProgressResponse(
            exercise_name=exercise,
            current_max=current_maxes.get(exercise),
            data=progress_by_exercise.get(exercise, []),
            goal=StrengthGoalResponse(
                id=goals[exercise].id,
                goal_type=goals[exercise].goal_type,
                exercise_name=goals[exercise].exercise_name,
                starting_weight=goals[exercise].starting_weight,
                target_weight=goals[exercise].target_weight,
                qualitative_goal=goals[exercise].qualitative_goal,
                target_date=goals[exercise].target_date,
                is_completed=goals[exercise].is_completed,
                created_at=goals[exercise].created_at
            ) if exercise in goals else None
        )
        for exercise in sorted(all_exercises)
    ]


# ─── Generate Program ─────────────────────────────────────────────────────────

@router.post("/generate-program")
def generate_program(
    data: GenerateProgramRequest,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    """Auto-generate a multi-week training program based on athlete profile."""
    # Determine number of weeks
    if data.weeks:
        weeks = data.weeks
    elif data.target_date:
        target = datetime.fromisoformat(data.target_date).date()
        days_until = (target - datetime.utcnow().date()).days
        weeks = max(1, days_until // 7)
    else:
        weeks = 4  # Default 4-week program

    weeks = min(weeks, 16)  # Cap at 16 weeks

    # Build an OnboardingRequest-like object from athlete's current profile
    onboarding_data = OnboardingRequest(
        training_goals=current_athlete.training_goals,
        injuries=current_athlete.injuries,
        experience_level=current_athlete.experience_level,
        has_coach=False
    )

    # If specific goals provided, override training_goals
    if data.goals:
        onboarding_data.training_goals = " ".join(data.goals)

    program = _generate_starter_program(current_athlete, onboarding_data, db, weeks=weeks)
    db.commit()

    return {
        "message": f"Program generated: {program.name} ({weeks} weeks)",
        "program_id": program.id,
        "program_name": program.name,
        "weeks": weeks
    }


# ─── Profile ──────────────────────────────────────────────────────────────────

@router.put("/profile")
def update_profile(
    data: dict,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    if "sport" in data:
        current_athlete.sport = data["sport"]
    if "team" in data:
        current_athlete.team = data["team"]
    if "training_goals" in data:
        current_athlete.training_goals = data["training_goals"]
    if "injuries" in data:
        current_athlete.injuries = data["injuries"]
    if "experience_level" in data:
        current_athlete.experience_level = data["experience_level"]
    if "name" in data:
        current_athlete.name = data["name"]

    db.commit()
    return {"message": "Profile updated successfully"}


@router.put("/coach")
def change_coach(
    data: dict,
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    invite_code = data.get("invite_code", "").upper()
    if not invite_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invite_code is required")

    coach = db.query(models.User).filter(models.User.invite_code == invite_code).first()
    if not coach:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid invite code")

    coach.coached_athletes.append(current_athlete)
    db.commit()
    db.refresh(current_athlete)

    return {
        "id": current_athlete.id,
        "email": current_athlete.email,
        "name": current_athlete.name,
        "user_type": current_athlete.user_type.value.lower(),
        "sport": current_athlete.sport,
        "team": current_athlete.team,
        "training_goals": current_athlete.training_goals,
        "injuries": current_athlete.injuries,
        "experience_level": current_athlete.experience_level,
        "onboarding_completed": current_athlete.onboarding_completed or False,
        "profile_photo_url": current_athlete.profile_photo_url,
    }


@router.post("/profile/photo")
def upload_profile_photo(
    file: UploadFile = File(...),
    current_athlete: models.User = Depends(get_current_athlete),
    db: Session = Depends(get_db)
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    contents = file.file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 5MB)")

    b64 = base64.b64encode(contents).decode("utf-8")
    data_url = f"data:{file.content_type};base64,{b64}"

    current_athlete.profile_photo_url = data_url
    db.commit()

    return {"profile_photo_url": data_url}
