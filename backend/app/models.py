from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Table, Enum, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import enum

class UserType(enum.Enum):
    ATHLETE = "athlete"
    COACH = "coach"

# Association table for coach-athlete relationships
coach_athlete = Table(
    'coach_athlete',
    Base.metadata,
    Column('coach_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('athlete_id', Integer, ForeignKey('users.id'), primary_key=True)
)

# Association table for group members
group_members = Table(
    'group_members',
    Base.metadata,
    Column('group_id', Integer, ForeignKey('groups.id'), primary_key=True),
    Column('athlete_id', Integer, ForeignKey('users.id'), primary_key=True)
)

# Association table for subgroup members
subgroup_members = Table(
    'subgroup_members',
    Base.metadata,
    Column('subgroup_id', Integer, ForeignKey('subgroups.id'), primary_key=True),
    Column('athlete_id', Integer, ForeignKey('users.id'), primary_key=True)
)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    user_type = Column(Enum(UserType), nullable=False)
    profile_photo_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Athlete-specific fields
    sport = Column(String, nullable=True)
    team = Column(String, nullable=True)
    training_goals = Column(Text, nullable=True)
    injuries = Column(Text, nullable=True)
    experience_level = Column(String, nullable=True)  # beginner, intermediate, advanced
    onboarding_completed = Column(Boolean, default=False)

    # Coach-specific fields
    coaching_credentials = Column(Text, nullable=True)
    bio = Column(Text, nullable=True)
    invite_code = Column(String(6), unique=True, nullable=True, index=True)  # 6-char code for coaches
    coach_onboarding_skip_fields = Column(Text, nullable=True)  # JSON list of fields to skip during athlete onboarding

    # Relationships
    coached_athletes = relationship(
        "User",
        secondary=coach_athlete,
        primaryjoin=id == coach_athlete.c.coach_id,
        secondaryjoin=id == coach_athlete.c.athlete_id,
        backref="coaches"
    )

    maxes = relationship("AthleteMax", back_populates="athlete", cascade="all, delete-orphan")
    workout_logs = relationship("WorkoutLog", back_populates="athlete", cascade="all, delete-orphan")
    strength_goals = relationship("StrengthGoal", back_populates="athlete", cascade="all, delete-orphan")
    groups_owned = relationship("Group", back_populates="coach", cascade="all, delete-orphan")

class AthleteMax(Base):
    __tablename__ = "athlete_maxes"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    exercise_name = Column(String, nullable=False)  # e.g., "squat", "deadlift", "bench", "clean"
    max_weight = Column(Float, nullable=False)
    unit = Column(String, default="lbs")
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    athlete = relationship("User", back_populates="maxes")

class StrengthGoal(Base):
    __tablename__ = "strength_goals"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    goal_type = Column(String, default="lift", nullable=False)  # "lift" or "qualitative"
    exercise_name = Column(String, nullable=True)  # required for lift goals
    starting_weight = Column(Float, nullable=True)  # required for lift goals
    target_weight = Column(Float, nullable=True)  # required for lift goals
    qualitative_goal = Column(Text, nullable=True)  # free text for qualitative goals
    target_date = Column(DateTime(timezone=True), nullable=True)
    is_completed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    athlete = relationship("User", back_populates="strength_goals")


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    coach_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    sport = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    coach = relationship("User", back_populates="groups_owned")
    subgroups = relationship("Subgroup", back_populates="group", cascade="all, delete-orphan")
    members = relationship("User", secondary=group_members, backref="groups")

class Subgroup(Base):
    __tablename__ = "subgroups"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    name = Column(String, nullable=False)
    training_focus = Column(String, nullable=True)  # e.g., "hypertrophy", "strength", "mobility"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    group = relationship("Group", back_populates="subgroups")
    members = relationship("User", secondary=subgroup_members, backref="subgroups")

class Program(Base):
    __tablename__ = "programs"

    id = Column(Integer, primary_key=True, index=True)
    coach_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    workouts = relationship("Workout", back_populates="program", cascade="all, delete-orphan")
    assignments = relationship("ProgramAssignment", back_populates="program", cascade="all, delete-orphan")

class ProgramAssignment(Base):
    __tablename__ = "program_assignments"

    id = Column(Integer, primary_key=True, index=True)
    program_id = Column(Integer, ForeignKey("programs.id"), nullable=False)

    # Assignment can be to individual, group, or subgroup
    athlete_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    subgroup_id = Column(Integer, ForeignKey("subgroups.id"), nullable=True)

    start_date = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    program = relationship("Program", back_populates="assignments")

class Workout(Base):
    __tablename__ = "workouts"

    id = Column(Integer, primary_key=True, index=True)
    program_id = Column(Integer, ForeignKey("programs.id"), nullable=True)  # Can be null for self-programmed
    athlete_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Set for self-programmed workouts
    name = Column(String, nullable=False)
    scheduled_date = Column(DateTime(timezone=True), nullable=False)
    day_offset = Column(Integer, nullable=True)  # Days from program start for template workouts
    description = Column(Text, nullable=True)  # Purpose/rationale of the workout
    athlete_modified = Column(Boolean, default=False)  # True if athlete edited a coach-assigned workout
    modification_notes = Column(Text, nullable=True)  # What the athlete changed
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    program = relationship("Program", back_populates="workouts")
    exercises = relationship("Exercise", back_populates="workout", cascade="all, delete-orphan")
    logs = relationship("WorkoutLog", back_populates="workout", cascade="all, delete-orphan")

class Exercise(Base):
    __tablename__ = "exercises"

    id = Column(Integer, primary_key=True, index=True)
    workout_id = Column(Integer, ForeignKey("workouts.id"), nullable=False)
    name = Column(String, nullable=False)
    sets = Column(Integer, nullable=False)
    reps = Column(Integer, nullable=False)
    percentage_of_max = Column(Float, nullable=True)  # e.g., 0.80 for 80%
    target_exercise = Column(String, nullable=True)  # Which max to use: "squat", "deadlift", etc.
    video_url = Column(String, nullable=True)
    coach_notes = Column(Text, nullable=True)
    order = Column(Integer, nullable=False)  # Order within workout
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    workout = relationship("Workout", back_populates="exercises")
    set_logs = relationship("SetLog", back_populates="exercise", cascade="all, delete-orphan")

class WorkoutLog(Base):
    __tablename__ = "workout_logs"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    workout_id = Column(Integer, ForeignKey("workouts.id"), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    is_completed = Column(Boolean, default=False)
    has_modifications = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    rpe = Column(Integer, nullable=True)  # Session-level Rate of Perceived Exertion (1-10)
    is_flagged = Column(Boolean, default=False)
    flag_reason = Column(Text, nullable=True)
    coach_acknowledged = Column(Boolean, default=False)
    coach_response = Column(Text, nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    athlete = relationship("User", back_populates="workout_logs")
    workout = relationship("Workout", back_populates="logs")
    set_logs = relationship("SetLog", back_populates="workout_log", cascade="all, delete-orphan")

class SetLog(Base):
    __tablename__ = "set_logs"

    id = Column(Integer, primary_key=True, index=True)
    workout_log_id = Column(Integer, ForeignKey("workout_logs.id"), nullable=False)
    exercise_id = Column(Integer, ForeignKey("exercises.id"), nullable=False)
    set_number = Column(Integer, nullable=False)
    weight_used = Column(Float, nullable=False)
    reps_completed = Column(Integer, nullable=False)
    rpe = Column(Integer, nullable=True)  # Rate of Perceived Exertion (1-10)
    notes = Column(Text, nullable=True)
    video_url = Column(String, nullable=True)
    was_modified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    workout_log = relationship("WorkoutLog", back_populates="set_logs")
    exercise = relationship("Exercise", back_populates="set_logs")

class ExerciseCatalog(Base):
    __tablename__ = "exercise_catalog"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    category = Column(String, nullable=True)  # compound, isolation, accessory, cardio, mobility
    muscle_group = Column(String, nullable=True)  # legs, chest, back, shoulders, arms, core, full_body
    is_custom = Column(Boolean, default=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # null for predefined
    created_at = Column(DateTime(timezone=True), server_default=func.now())
