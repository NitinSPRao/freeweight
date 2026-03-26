from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List
from ..database import get_db
from ..auth import get_current_coach
from ..models import User, Program, Workout, Exercise, ProgramAssignment, Group, Subgroup
from ..schemas.program import (
    ProgramCreate,
    ProgramResponse,
    WorkoutCreate,
    WorkoutResponse,
    ExerciseCreate,
    ExerciseResponse,
    AssignmentCreate
)

router = APIRouter(prefix="/api/programs", tags=["programs"])


def _serialize_program(program: Program, include_workouts: bool = True) -> ProgramResponse:
    workouts = []
    if include_workouts:
        for workout in program.workouts:
            exercises = [
                ExerciseResponse(
                    id=ex.id,
                    name=ex.name,
                    sets=ex.sets,
                    reps=ex.reps,
                    percentage_of_max=ex.percentage_of_max,
                    target_exercise=ex.target_exercise,
                    video_url=ex.video_url,
                    coach_notes=ex.coach_notes,
                    order=ex.order
                )
                for ex in sorted(workout.exercises, key=lambda e: e.order)
            ]
            workouts.append(WorkoutResponse(
                id=workout.id,
                name=workout.name,
                day_offset=workout.day_offset,
                scheduled_date=workout.scheduled_date,
                description=workout.description,
                exercises=exercises
            ))

    # Count only template workouts (athlete_id is None = coach-created templates)
    template_count = sum(1 for w in program.workouts if w.athlete_id is None)

    return ProgramResponse(
        id=program.id,
        name=program.name,
        description=program.description,
        created_at=program.created_at,
        workouts=workouts,
        workout_count=template_count
    )


@router.get("", response_model=List[ProgramResponse])
def list_programs(
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    programs = db.query(Program).filter(
        Program.coach_id == current_coach.id
    ).order_by(Program.created_at.desc()).all()

    return [_serialize_program(p, include_workouts=False) for p in programs]


@router.post("", response_model=ProgramResponse)
def create_program(
    program_data: ProgramCreate,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    new_program = Program(
        coach_id=current_coach.id,
        name=program_data.name,
        description=program_data.description
    )
    db.add(new_program)
    db.commit()
    db.refresh(new_program)

    return ProgramResponse(
        id=new_program.id,
        name=new_program.name,
        description=new_program.description,
        created_at=new_program.created_at,
        workouts=[]
    )


@router.get("/{program_id}", response_model=ProgramResponse)
def get_program(
    program_id: int,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    program = db.query(Program).filter(
        Program.id == program_id,
        Program.coach_id == current_coach.id
    ).first()

    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    return _serialize_program(program)


@router.post("/{program_id}/workouts", response_model=WorkoutResponse)
def add_workout_to_program(
    program_id: int,
    workout_data: WorkoutCreate,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    program = db.query(Program).filter(
        Program.id == program_id,
        Program.coach_id == current_coach.id
    ).first()

    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    # Template workouts use a placeholder date; actual dates are set during assignment.
    new_workout = Workout(
        program_id=program_id,
        name=workout_data.name,
        day_offset=workout_data.day_offset,
        description=workout_data.description,
        scheduled_date=datetime.utcnow()
    )
    db.add(new_workout)
    db.commit()
    db.refresh(new_workout)

    return WorkoutResponse(
        id=new_workout.id,
        name=new_workout.name,
        day_offset=new_workout.day_offset,
        scheduled_date=new_workout.scheduled_date,
        description=new_workout.description,
        exercises=[]
    )


@router.post("/workouts/{workout_id}/exercises", response_model=ExerciseResponse)
def add_exercise_to_workout(
    workout_id: int,
    exercise_data: ExerciseCreate,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    workout = db.query(Workout).join(Program).filter(
        Workout.id == workout_id,
        Program.coach_id == current_coach.id
    ).first()

    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")

    new_exercise = Exercise(
        workout_id=workout_id,
        name=exercise_data.name,
        sets=exercise_data.sets,
        reps=exercise_data.reps,
        percentage_of_max=exercise_data.percentage_of_max,
        target_exercise=exercise_data.target_exercise,
        video_url=exercise_data.video_url,
        coach_notes=exercise_data.coach_notes,
        order=exercise_data.order
    )
    db.add(new_exercise)
    db.commit()
    db.refresh(new_exercise)

    return ExerciseResponse(
        id=new_exercise.id,
        name=new_exercise.name,
        sets=new_exercise.sets,
        reps=new_exercise.reps,
        percentage_of_max=new_exercise.percentage_of_max,
        target_exercise=new_exercise.target_exercise,
        video_url=new_exercise.video_url,
        coach_notes=new_exercise.coach_notes,
        order=new_exercise.order
    )


@router.post("/{program_id}/assign")
def assign_program(
    program_id: int,
    assignment_data: AssignmentCreate,
    current_coach: User = Depends(get_current_coach),
    db: Session = Depends(get_db)
):
    program = db.query(Program).filter(
        Program.id == program_id,
        Program.coach_id == current_coach.id
    ).first()

    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    if not any([assignment_data.athlete_id, assignment_data.group_id, assignment_data.subgroup_id]):
        raise HTTPException(
            status_code=400,
            detail="Must specify athlete_id, group_id, or subgroup_id"
        )

    # Resolve the set of athletes this program should be assigned to.
    athletes_by_id: dict[int, User] = {}

    if assignment_data.athlete_id:
        athlete = db.query(User).filter(User.id == assignment_data.athlete_id).first()
        if not athlete or athlete not in current_coach.coached_athletes:
            raise HTTPException(status_code=404, detail="Athlete not found in your roster")
        athletes_by_id[athlete.id] = athlete

    if assignment_data.group_id:
        group = db.query(Group).filter(
            Group.id == assignment_data.group_id,
            Group.coach_id == current_coach.id
        ).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        for member in group.members:
            athletes_by_id[member.id] = member

    if assignment_data.subgroup_id:
        subgroup = db.query(Subgroup).join(Group).filter(
            Subgroup.id == assignment_data.subgroup_id,
            Group.coach_id == current_coach.id
        ).first()
        if not subgroup:
            raise HTTPException(status_code=404, detail="Subgroup not found")
        for member in subgroup.members:
            athletes_by_id[member.id] = member

    athletes = list(athletes_by_id.values())

    # Template workouts are those where athlete_id is NULL (created by the coach).
    template_workouts = [w for w in program.workouts if w.athlete_id is None]

    start_date = assignment_data.start_date

    # Materialize concrete workout + exercise copies for each athlete.
    for athlete in athletes:
        for template in template_workouts:
            day_offset = template.day_offset or 0
            scheduled_date = start_date + timedelta(days=day_offset)

            concrete_workout = Workout(
                program_id=program_id,
                athlete_id=athlete.id,
                name=template.name,
                description=template.description,
                scheduled_date=scheduled_date,
                day_offset=day_offset
            )
            db.add(concrete_workout)
            db.flush()  # populate concrete_workout.id

            for template_exercise in sorted(template.exercises, key=lambda e: e.order):
                db.add(Exercise(
                    workout_id=concrete_workout.id,
                    name=template_exercise.name,
                    sets=template_exercise.sets,
                    reps=template_exercise.reps,
                    percentage_of_max=template_exercise.percentage_of_max,
                    target_exercise=template_exercise.target_exercise,
                    video_url=template_exercise.video_url,
                    coach_notes=template_exercise.coach_notes,
                    order=template_exercise.order
                ))

    # Record the assignment.
    assignment = ProgramAssignment(
        program_id=program_id,
        athlete_id=assignment_data.athlete_id,
        group_id=assignment_data.group_id,
        subgroup_id=assignment_data.subgroup_id,
        start_date=start_date
    )
    db.add(assignment)
    db.commit()

    return {
        "message": "Program assigned successfully",
        "athletes_assigned": len(athletes),
        "sessions_created": len(template_workouts) * len(athletes)
    }
