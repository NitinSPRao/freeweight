# Freeweight - Next Steps

Last updated: March 3, 2026

---

## Current State

### ✅ Completed

1. **Repository Structure**
   - `/landing/` - Marketing site with UI mockups
   - `/backend/` - FastAPI production backend
   - `/frontend/` - React Native (Expo) mobile app
   - `/documentation/` - Specs, guides, and architecture docs

2. **Backend Infrastructure**
   - FastAPI + PostgreSQL + SQLAlchemy setup
   - Complete database schema (13 tables) matching product spec
   - JWT authentication utilities (passlib + python-jose)
   - Alembic migrations configured and applied
   - Python package management via `uv`
   - Running on `http://localhost:8001`

3. **Backend API - Complete** ✅
   - **Authentication** (`/api/auth`) - Signup, login, get current user (includes coach info for athletes)
   - **Coach Routes** (`/api/coaches`) - Dashboard, roster, invites, groups, onboarding settings
   - **Program Builder** (`/api/programs`) - Create programs, workouts, exercises, assignments (with descriptions)
   - **Athlete Routes** (`/api/athletes`) - Onboarding, calendar, workout logging, progress tracking, goals, join coach, workout CRUD, program generation
   - **Exercise Catalog** (`/api/exercises`) - Search, filter, create custom exercises
   - All endpoints functional with proper auth, error handling, validation
   - API docs at http://localhost:8001/docs

4. **Frontend App - Complete** ✅
   - React Native + Expo + TypeScript
   - Navigation configured (React Navigation) with role-based routing
   - Auth context with JWT secure storage and user refresh
   - Custom bottom tab bar (no @react-navigation/bottom-tabs)
   - **Athlete screens**: Home (calendar + today's workout + RPE color coding + generate plan), Progress (maxes with ExercisePicker + goals), Profile (coach connection), Workout (guided flow + rest timer + debrief), Onboarding (4-step wizard)
   - **Coach screens**: Dashboard (stats + flags + onboarding settings), Roster (grouped athletes), Programs (list + create), ProgramBuilder (with ExercisePicker), AthleteDetail
   - **Shared components**: BottomTabBar, ExercisePicker, RestTimer, RPESlider, AddWorkoutModal

5. **Database Tables**
   - `users` - Athletes and coaches (with onboarding fields, coach skip settings)
   - `athlete_maxes` - Recorded lifts per athlete
   - `strength_goals` - Lift and qualitative goals
   - `exercise_catalog` - Predefined + custom exercises
   - `groups` / `subgroups` - Team organization
   - `programs` - Training programs
   - `program_assignments` - Links programs to athletes/groups/subgroups
   - `workouts` - Individual workout sessions (with descriptions)
   - `exercises` - Exercises within workouts
   - `workout_logs` - Athlete's completed workout records (with RPE)
   - `set_logs` - Individual set performance data

6. **Documentation**
   - [CLAUDE.md](CLAUDE.md) - Coding guidelines and architecture
   - [mvp_spec.md](mvp_spec.md) - Complete product specification
   - [ONBOARDING_FLOW.md](ONBOARDING_FLOW.md) - Athlete onboarding details
   - [STYLE_GUIDE.md](STYLE_GUIDE.md) - Design system
   - [BRAND_POSITION.md](BRAND_POSITION.md) - Brand guide

---

## What Just Happened (March 25, 2026)

Implemented 11 features in a single session:

1. **Dropdown menu for max lifts** — ExercisePicker component with search, categories, and custom exercise creation
2. **Strength goals** — Lift and qualitative goals with create/complete/delete CRUD
3. **Coach onboarding settings** — Coaches configure which fields athletes skip during onboarding
4. **Exercise catalog** — ~60 predefined exercises + custom exercises, searchable/filterable
5. **Join coach from profile** — Athletes can enter invite code to connect to a coach post-signup
6. **Rest timer** — Optional between-set timer with preset durations and vibration
7. **Workout debrief** — RPE rating (1-10) and notes at end of workout
8. **RPE color coding** — Calendar workouts color-coded by RPE (green→yellow→orange→red)
9. **Auto-generate program** — Multi-week progressive overload with deload weeks
10. **Workout descriptions** — Descriptions on workouts visible in cards and during workout
11. **Calendar + button** — Create or copy workouts from any calendar day

---

## Next Steps

### Immediate (before launch)

1. **Run Alembic migration** — Schema changes in models.py need `alembic revision --autogenerate` + `alembic upgrade head`
2. **Seed exercise catalog** — ~60 predefined exercises need to be inserted into ExerciseCatalog table
3. **End-to-end testing** — Test full flow with real backend data (signup → onboard → workout → complete)
4. **Install frontend deps** — Run `npm install` in `/frontend/`

### Phase Next: Polish
1. Push notifications (Expo Notifications) — daily workout reminders
2. Video demo URL support in exercise detail
3. Offline support (cache workouts for gym use)
4. Video upload/playback for lift recording

---

## Development Workflow

### Running Everything Locally

```bash
# Terminal 1: Backend
cd backend
uv run uvicorn app.main:app --reload --port 8001

# Terminal 2: Frontend
cd frontend
npm install        # First time only
npm start          # Starts Expo dev server
# Then press 'i' for iOS or 'a' for Android

# Terminal 3: Database (if needed)
psql freeweight
```

### Before Each Session

1. Pull latest changes: `git pull`
2. Check for new migrations: `cd backend && uv run alembic upgrade head`
3. Install any new dependencies:
   - Backend: `cd backend && uv sync`
   - Frontend: `cd frontend && npm install`
4. Start backend: `cd backend && uv run uvicorn app.main:app --reload --port 8001`

---

## API Endpoints Reference

All endpoints documented at http://localhost:8001/docs

### Auth (`/api/auth`)
- `POST /api/auth/signup` - Create new user
- `POST /api/auth/login` - Login and get JWT
- `GET /api/auth/me` - Get current user (includes coach_name, coach_id for athletes)

### Coach (`/api/coaches`)
- `GET /api/coaches/dashboard` - Stats and flags
- `GET /api/coaches/roster` - All athletes
- `POST /api/coaches/invite` - Generate invite link
- `POST /api/coaches/groups` - Create group
- `POST /api/coaches/groups/{id}/subgroups` - Create subgroup
- `GET /api/coaches/onboarding-settings` - Get skip fields config
- `PUT /api/coaches/onboarding-settings` - Update skip fields config
- `GET /api/coaches/onboarding-config/{invite_code}` - Public: get coach onboarding config

### Programs (`/api/programs`)
- `GET /api/programs` - List coach's programs
- `POST /api/programs` - Create program
- `GET /api/programs/{id}` - View program
- `POST /api/programs/{id}/workouts` - Add workout (with description)
- `POST /api/programs/workouts/{id}/exercises` - Add exercise
- `POST /api/programs/{id}/assign` - Assign to athlete/group (materializes workouts)

### Athletes (`/api/athletes`)
- `POST /api/athletes/onboarding` - Complete onboarding
- `PUT /api/athletes/maxes` - Update max
- `DELETE /api/athletes/maxes/{exercise_name}` - Delete max
- `GET /api/athletes/goals` - List strength goals
- `POST /api/athletes/goals` - Create goal (lift or qualitative)
- `PUT /api/athletes/goals/{id}` - Update goal
- `DELETE /api/athletes/goals/{id}` - Delete goal
- `POST /api/athletes/goals/{id}/complete` - Mark goal complete
- `POST /api/athletes/join-coach` - Connect to coach via invite code
- `GET /api/athletes/calendar` - View scheduled workouts (with RPE + description)
- `GET /api/athletes/workouts/today` - Today's workout
- `GET /api/athletes/workouts/{id}` - Get specific workout
- `POST /api/athletes/workouts` - Create self-programmed workout
- `POST /api/athletes/workouts/{id}/copy` - Deep-copy workout to new date
- `POST /api/athletes/workouts/{id}/start` - Start workout
- `POST /api/athletes/workouts/{id}/sets` - Log set
- `POST /api/athletes/workouts/{id}/complete` - Complete workout (with RPE + notes)
- `POST /api/athletes/workouts/{id}/flag` - Flag issue
- `GET /api/athletes/history` - Completion history (with RPE)
- `GET /api/athletes/progress` - Max progression
- `POST /api/athletes/generate-program` - Auto-generate multi-week program

### Exercises (`/api/exercises`)
- `GET /api/exercises` - Search/filter exercise catalog
- `POST /api/exercises` - Create custom exercise
- `DELETE /api/exercises/{id}` - Delete custom exercise

---

## Key Decisions Still Needed

1. **Video storage** - S3, Cloudinary, or Firebase Storage for exercise demos and lift videos?
2. **Push notifications** - Expo's built-in or Firebase Cloud Messaging?
3. **Production database hosting** - Supabase, Railway, or Render?
4. **Production deployment** - Vercel for web, EAS Build for mobile?
5. **Analytics** - Mixpanel, Amplitude, or PostHog for user tracking?

---

## Reference

- **Product Spec:** [mvp_spec.md](mvp_spec.md)
- **Database Schema:** [backend/app/models.py](backend/app/models.py)
- **API Routes:** [backend/app/routes/](backend/app/routes/)
- **API Docs:** http://localhost:8001/docs (when backend is running)
- **Design System:** [STYLE_GUIDE.md](STYLE_GUIDE.md)
- **Frontend Code:** [frontend/src/](frontend/src/)
