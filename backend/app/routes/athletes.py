from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, date, timedelta
from typing import Optional
import base64
from ..database import get_db
from ..auth import get_current_athlete
from .. import models
from ..schemas.athlete import OnboardingRequest, MaxUpdate, CalendarWorkout, CalendarExerciseSummary, ProgressResponse, ProgressDataPoint, StrengthGoalResponse
from ..schemas.workout import WorkoutResponse, ExerciseResponse, SetLogCreate, WorkoutComplete, FlagRequest, WorkoutLogResponse, WorkoutEdit

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

    # Save strength goals if provided
    if data.goals:
        for exercise_name, goal_data in data.goals.items():
            target_weight = goal_data.get("target_weight")
            target_date_str = goal_data.get("target_date")
            if target_weight and target_date_str:
                # Use current max as starting weight, or 0 if not set
                starting_weight = 0.0
                if data.maxes and exercise_name in data.maxes:
                    starting_weight = data.maxes[exercise_name]
                db.add(models.StrengthGoal(
                    athlete_id=current_athlete.id,
                    exercise_name=exercise_name,
                    starting_weight=starting_weight,
                    target_weight=float(target_weight),
                    target_date=datetime.fromisoformat(target_date_str)
                ))

    # For coachless athletes, generate a starter program
    if not data.has_coach:
        _generate_starter_program(current_athlete, data, db)

    db.commit()
    return {"message": "Onboarding completed successfully"}


def _generate_starter_program(athlete: models.User, data: OnboardingRequest, db: Session):
    """Generate a starter training program based on athlete goals and experience."""
    goals = (data.training_goals or "").lower()
    level = (data.experience_level or "beginner").lower()
    injuries = (data.injuries or "").lower()

    # Choose program template based on goals
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

    # Filter out exercises that target injured areas
    if injuries:
        workouts = _filter_for_injuries(workouts, injuries)

    # Create the program (self-programmed, no coach_id)
    program = models.Program(
        coach_id=athlete.id,  # athlete owns their own program
        name=program_name,
        description=program_desc
    )
    db.add(program)
    db.flush()

    # Create workouts and exercises, materialized for the athlete
    today = datetime.utcnow().date()
    for day_offset, workout_data in enumerate(workouts):
        scheduled = datetime(today.year, today.month, today.day) + timedelta(days=day_offset)
        workout = models.Workout(
            program_id=program.id,
            athlete_id=athlete.id,
            name=workout_data["name"],
            scheduled_date=scheduled,
            day_offset=day_offset
        )
        db.add(workout)
        db.flush()

        for order, ex in enumerate(workout_data["exercises"], 1):
            db.add(models.Exercise(
                workout_id=workout.id,
                name=ex["name"],
                sets=ex["sets"],
                reps=ex["reps"],
                percentage_of_max=ex.get("percentage"),
                target_exercise=ex.get("target"),
                coach_notes=ex.get("notes"),
                order=order
            ))


def _strength_template(level: str) -> list[dict]:
    pct = {"beginner": 0.65, "intermediate": 0.75, "advanced": 0.85}.get(level, 0.65)
    pct2 = pct + 0.05
    return [
        {"name": "Day 1 — Squat Focus", "exercises": [
            {"name": "Back Squat", "sets": 5, "reps": 5, "percentage": pct2, "target": "squat"},
            {"name": "Romanian Deadlift", "sets": 3, "reps": 8, "percentage": 0.55, "target": "deadlift"},
            {"name": "Leg Press", "sets": 3, "reps": 10},
            {"name": "Plank", "sets": 3, "reps": 60, "notes": "Hold for 60 seconds"},
        ]},
        {"name": "Day 2 — Bench Focus", "exercises": [
            {"name": "Bench Press", "sets": 5, "reps": 5, "percentage": pct2, "target": "bench"},
            {"name": "Overhead Press", "sets": 3, "reps": 8, "percentage": 0.60, "target": "bench"},
            {"name": "Barbell Row", "sets": 4, "reps": 8},
            {"name": "Tricep Dips", "sets": 3, "reps": 10},
        ]},
        {"name": "Day 3 — Rest", "exercises": [
            {"name": "Light Cardio / Mobility", "sets": 1, "reps": 1, "notes": "20-30 min easy cardio or stretching"},
        ]},
        {"name": "Day 4 — Deadlift Focus", "exercises": [
            {"name": "Deadlift", "sets": 5, "reps": 3, "percentage": pct2, "target": "deadlift"},
            {"name": "Front Squat", "sets": 3, "reps": 6, "percentage": 0.60, "target": "squat"},
            {"name": "Pull-Ups", "sets": 4, "reps": 8},
            {"name": "Hanging Leg Raise", "sets": 3, "reps": 12},
        ]},
        {"name": "Day 5 — Accessory", "exercises": [
            {"name": "Incline Dumbbell Press", "sets": 3, "reps": 10},
            {"name": "Dumbbell Lunges", "sets": 3, "reps": 12},
            {"name": "Face Pulls", "sets": 3, "reps": 15},
            {"name": "Farmer's Walk", "sets": 3, "reps": 1, "notes": "40m per set"},
        ]},
    ]


def _hypertrophy_template(level: str) -> list[dict]:
    base_sets = {"beginner": 3, "intermediate": 4, "advanced": 4}.get(level, 3)
    return [
        {"name": "Day 1 — Push", "exercises": [
            {"name": "Bench Press", "sets": base_sets, "reps": 10, "percentage": 0.65, "target": "bench"},
            {"name": "Incline Dumbbell Press", "sets": base_sets, "reps": 12},
            {"name": "Overhead Press", "sets": base_sets, "reps": 10},
            {"name": "Cable Flyes", "sets": 3, "reps": 15},
            {"name": "Lateral Raises", "sets": 3, "reps": 15},
            {"name": "Tricep Pushdowns", "sets": 3, "reps": 12},
        ]},
        {"name": "Day 2 — Pull", "exercises": [
            {"name": "Barbell Row", "sets": base_sets, "reps": 10},
            {"name": "Pull-Ups", "sets": base_sets, "reps": 8},
            {"name": "Seated Cable Row", "sets": 3, "reps": 12},
            {"name": "Face Pulls", "sets": 3, "reps": 15},
            {"name": "Barbell Curl", "sets": 3, "reps": 12},
            {"name": "Hammer Curls", "sets": 3, "reps": 12},
        ]},
        {"name": "Day 3 — Legs", "exercises": [
            {"name": "Back Squat", "sets": base_sets, "reps": 10, "percentage": 0.65, "target": "squat"},
            {"name": "Romanian Deadlift", "sets": base_sets, "reps": 10, "percentage": 0.55, "target": "deadlift"},
            {"name": "Leg Press", "sets": 3, "reps": 12},
            {"name": "Leg Curl", "sets": 3, "reps": 12},
            {"name": "Calf Raises", "sets": 4, "reps": 15},
        ]},
        {"name": "Day 4 — Rest", "exercises": [
            {"name": "Light Cardio / Stretching", "sets": 1, "reps": 1, "notes": "20-30 min recovery"},
        ]},
        {"name": "Day 5 — Upper", "exercises": [
            {"name": "Overhead Press", "sets": base_sets, "reps": 10},
            {"name": "Weighted Dips", "sets": base_sets, "reps": 10},
            {"name": "Dumbbell Row", "sets": 3, "reps": 12},
            {"name": "Lateral Raises", "sets": 3, "reps": 15},
            {"name": "Skull Crushers", "sets": 3, "reps": 12},
        ]},
        {"name": "Day 6 — Legs", "exercises": [
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
        {"name": "Day 1 — Power", "exercises": [
            {"name": "Power Clean", "sets": 5, "reps": 3, "percentage": pct, "target": "clean"},
            {"name": "Back Squat", "sets": 4, "reps": 5, "percentage": pct, "target": "squat"},
            {"name": "Box Jumps", "sets": 4, "reps": 5, "notes": "Focus on explosive hip extension"},
            {"name": "Plank", "sets": 3, "reps": 45, "notes": "Hold for 45 seconds"},
        ]},
        {"name": "Day 2 — Upper Strength", "exercises": [
            {"name": "Bench Press", "sets": 4, "reps": 6, "percentage": pct, "target": "bench"},
            {"name": "Weighted Pull-Ups", "sets": 4, "reps": 6},
            {"name": "Dumbbell Shoulder Press", "sets": 3, "reps": 8},
            {"name": "Medicine Ball Slams", "sets": 3, "reps": 10, "notes": "Explosive"},
        ]},
        {"name": "Day 3 — Conditioning", "exercises": [
            {"name": "Sprint Intervals", "sets": 8, "reps": 1, "notes": "30s sprint, 60s rest"},
            {"name": "Agility Ladder Drills", "sets": 4, "reps": 1, "notes": "Various patterns"},
            {"name": "Bodyweight Circuit", "sets": 3, "reps": 1, "notes": "10 push-ups, 10 squats, 10 burpees"},
        ]},
        {"name": "Day 4 — Lower Strength", "exercises": [
            {"name": "Deadlift", "sets": 4, "reps": 5, "percentage": pct, "target": "deadlift"},
            {"name": "Bulgarian Split Squats", "sets": 3, "reps": 8},
            {"name": "Glute-Ham Raise", "sets": 3, "reps": 10},
            {"name": "Single-Leg Calf Raises", "sets": 3, "reps": 12},
        ]},
        {"name": "Day 5 — Sport Skills + Recovery", "exercises": [
            {"name": "Sport-Specific Drills", "sets": 1, "reps": 1, "notes": "30 min sport practice"},
            {"name": "Foam Rolling / Mobility", "sets": 1, "reps": 1, "notes": "20 min recovery"},
        ]},
    ]


def _general_template(level: str) -> list[dict]:
    pct = {"beginner": 0.60, "intermediate": 0.70, "advanced": 0.75}.get(level, 0.60)
    base_sets = {"beginner": 3, "intermediate": 3, "advanced": 4}.get(level, 3)
    return [
        {"name": "Day 1 — Full Body A", "exercises": [
            {"name": "Back Squat", "sets": base_sets, "reps": 8, "percentage": pct, "target": "squat"},
            {"name": "Bench Press", "sets": base_sets, "reps": 8, "percentage": pct, "target": "bench"},
            {"name": "Barbell Row", "sets": base_sets, "reps": 10},
            {"name": "Plank", "sets": 3, "reps": 45, "notes": "Hold for 45 seconds"},
        ]},
        {"name": "Day 2 — Cardio + Core", "exercises": [
            {"name": "Cardio", "sets": 1, "reps": 1, "notes": "25-30 min moderate intensity"},
            {"name": "Russian Twists", "sets": 3, "reps": 20},
            {"name": "Dead Bug", "sets": 3, "reps": 12},
            {"name": "Stretching", "sets": 1, "reps": 1, "notes": "10 min full body stretch"},
        ]},
        {"name": "Day 3 — Full Body B", "exercises": [
            {"name": "Deadlift", "sets": base_sets, "reps": 6, "percentage": pct, "target": "deadlift"},
            {"name": "Overhead Press", "sets": base_sets, "reps": 8},
            {"name": "Pull-Ups", "sets": base_sets, "reps": 8},
            {"name": "Dumbbell Lunges", "sets": 3, "reps": 10},
        ]},
        {"name": "Day 4 — Rest", "exercises": [
            {"name": "Light Walk / Stretching", "sets": 1, "reps": 1, "notes": "Active recovery"},
        ]},
        {"name": "Day 5 — Full Body C", "exercises": [
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
            exercises=exercises
        ))

    return calendar_workouts


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
        # Remove existing exercises and replace
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

    # Mark as athlete-modified (so coach can see the change)
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
            flag_reason=data.reason
        )
        db.add(workout_log)
    else:
        workout_log.is_flagged = True
        workout_log.flag_reason = data.reason

    db.commit()
    return {"message": "Workout flagged successfully"}


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
            flag_reason=log.flag_reason
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

    # Fetch strength goals
    goals_query = db.query(models.StrengthGoal).filter(
        models.StrengthGoal.athlete_id == current_athlete.id
    )
    if exercise_name:
        goals_query = goals_query.filter(models.StrengthGoal.exercise_name == exercise_name)
    goals = {g.exercise_name: g for g in goals_query.all()}

    # Combine exercises from both maxes and goals
    all_exercises = set(progress_by_exercise.keys()) | set(goals.keys())

    return [
        ProgressResponse(
            exercise_name=exercise,
            current_max=current_maxes.get(exercise),
            data=progress_by_exercise.get(exercise, []),
            goal=StrengthGoalResponse(
                id=goals[exercise].id,
                exercise_name=goals[exercise].exercise_name,
                starting_weight=goals[exercise].starting_weight,
                target_weight=goals[exercise].target_weight,
                target_date=goals[exercise].target_date,
                created_at=goals[exercise].created_at
            ) if exercise in goals else None
        )
        for exercise in sorted(all_exercises)
    ]


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

    # Read and store as base64 data URL (simple approach for MVP)
    contents = file.file.read()
    if len(contents) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(status_code=400, detail="Image too large (max 5MB)")

    b64 = base64.b64encode(contents).decode("utf-8")
    data_url = f"data:{file.content_type};base64,{b64}"

    current_athlete.profile_photo_url = data_url
    db.commit()

    return {"profile_photo_url": data_url}
