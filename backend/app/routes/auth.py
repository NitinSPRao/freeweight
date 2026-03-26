from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.auth import SignupRequest, LoginRequest, TokenResponse, UserResponse
from ..models import User, UserType
from ..auth import get_password_hash, verify_password, create_access_token, get_current_user
import logging
import random
import string
import base64

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

def generate_invite_code() -> str:
    """Generate a unique 6-character invite code."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


def _user_dict(user: User) -> dict:
    result = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "user_type": user.user_type.value.lower(),
        "sport": user.sport,
        "team": user.team,
        "training_goals": user.training_goals,
        "injuries": user.injuries,
        "experience_level": user.experience_level,
        "onboarding_completed": user.onboarding_completed or False,
        "coaching_credentials": user.coaching_credentials,
        "bio": user.bio,
        "profile_photo_url": user.profile_photo_url,
        "invite_code": user.invite_code if user.user_type == UserType.COACH else None
    }

    # Include coach info for athletes
    if user.user_type == UserType.ATHLETE and hasattr(user, 'coaches') and user.coaches:
        coach = user.coaches[0]
        result["coach_name"] = coach.name
        result["coach_id"] = coach.id
    else:
        result["coach_name"] = None
        result["coach_id"] = None

    return result


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(request: SignupRequest, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    hashed_password = get_password_hash(request.password)

    # Generate unique invite code for coaches
    invite_code = None
    if request.user_type == UserType.COACH:
        while True:
            invite_code = generate_invite_code()
            # Check if code is unique
            if not db.query(User).filter(User.invite_code == invite_code).first():
                break

    # Handle athlete invite code - find coach and connect
    coach = None
    if request.user_type == UserType.ATHLETE and request.invite_code:
        coach = db.query(User).filter(User.invite_code == request.invite_code.upper()).first()
        if not coach:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid invite code"
            )
        logger.info(f"🔗 Athlete signing up with coach: {coach.email}")

    new_user = User(
        email=request.email,
        hashed_password=hashed_password,
        name=request.name,
        user_type=request.user_type,
        sport=request.sport,
        team=request.team,
        training_goals=request.training_goals,
        coaching_credentials=request.coaching_credentials,
        bio=request.bio,
        invite_code=invite_code
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Connect athlete to coach if invite code was used
    if coach:
        coach.coached_athletes.append(new_user)
        db.commit()
        logger.info(f"✅ Athlete {new_user.email} connected to coach {coach.email}")

    access_token = create_access_token(data={"sub": new_user.id})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": _user_dict(new_user)
    }

@router.post("/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    logger.info(f"🔐 Login attempt for email: {form_data.username}")

    user = db.query(User).filter(User.email == form_data.username).first()
    if not user:
        logger.warning(f"❌ User not found: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    logger.info(f"✅ User found: {user.email} (ID: {user.id})")
    logger.info(f"🔑 Verifying password...")

    password_valid = verify_password(form_data.password, user.hashed_password)
    logger.info(f"🔑 Password verification result: {password_valid}")

    if not password_valid:
        logger.warning(f"❌ Invalid password for user: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    logger.info(f"🎫 Creating access token for user ID: {user.id}")
    access_token = create_access_token(data={"sub": user.id})

    user_dict = _user_dict(user)
    logger.info(f"📦 Response user_type: {user_dict['user_type']}")
    logger.info(f"📦 Response onboarding_completed: {user_dict['onboarding_completed']}")
    logger.info(f"✅ Login successful for: {user.email}")

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_dict
    }

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.patch("/me")
def update_profile(
    update_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user profile (for onboarding and profile updates)"""
    logger.info(f"📝 Profile update request for user: {current_user.email}")

    # Allowed fields to update
    allowed_fields = [
        "name", "sport", "team", "training_goals", "coaching_credentials",
        "bio", "injuries", "experience_level", "onboarding_completed",
        "profile_photo_url"
    ]

    # Update only allowed fields
    for field, value in update_data.items():
        if field in allowed_fields and hasattr(current_user, field):
            setattr(current_user, field, value)
            logger.info(f"  Updated {field}: {value}")

    db.commit()
    db.refresh(current_user)

    logger.info(f"✅ Profile updated successfully for: {current_user.email}")

    return _user_dict(current_user)

@router.post("/profile/photo")
def upload_profile_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload profile photo for any user (coach or athlete)"""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Read and store as base64 data URL (simple approach for MVP)
    contents = file.file.read()
    if len(contents) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(status_code=400, detail="Image too large (max 5MB)")

    b64 = base64.b64encode(contents).decode("utf-8")
    data_url = f"data:{file.content_type};base64,{b64}"

    current_user.profile_photo_url = data_url
    db.commit()

    logger.info(f"📸 Profile photo uploaded for: {current_user.email}")

    return {"profile_photo_url": data_url}
