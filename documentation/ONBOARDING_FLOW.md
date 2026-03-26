# Athlete Onboarding Flow

## Overview

After signup, athletes are redirected to a 4-step onboarding wizard (`/athlete/onboarding`). The flow differs based on whether the athlete signed up with a coach invite code or not.

## Two Paths

### Path A: Athlete WITH Coach (has invite code)
- Coach will assign programs, so onboarding only collects profile data
- Steps 1-4 collect info, then redirect to `/athlete/home`
- No program is generated — the athlete waits for their coach to assign one
- **Coach skip fields**: If the coach has configured onboarding skip fields (via Dashboard → Onboarding Settings), certain steps/fields are hidden. For example, a coach might skip "Sport" and "Maxes" if they'll set those up themselves.

### Path B: Athlete WITHOUT Coach (no invite code)
- After onboarding, the system auto-generates a starter training program
- Program is tailored to the athlete's goals, experience level, injuries, and maxes
- Athlete lands on `/athlete/home` with workouts already on their calendar

### Path C: Athlete joins coach after signup
- Athletes can enter a coach's invite code from Profile → MY COACH at any time
- No re-onboarding required — athlete is added to the coach's roster immediately
- Coach can then assign programs to the athlete

## Steps

### Step 1: Sport & Team
- **Sport** (optional text) — e.g. "Football", "Basketball"
- **Team/Gym** (optional text) — e.g. "Columbia Lions"

### Step 2: Goals & Experience
- **Training Goal** (required, single-select):
  - Build Strength — compound-focused strength program
  - Build Muscle — volume-focused hypertrophy (PPL)
  - Athletic Performance — power + conditioning for sport
  - General Fitness — full-body well-rounded program
- **Experience Level** (required, single-select):
  - Beginner (< 1 year)
  - Intermediate (1-3 years)
  - Advanced (3+ years)

### Step 3: Injuries & Limitations
- **Injuries** (optional textarea) — free-text description
- Used to filter out exercises that could aggravate reported areas
- Injury keywords detected: knee, shoulder, back, wrist, ankle, hip

### Step 4: Current Maxes
- **Back Squat** (lbs, optional)
- **Bench Press** (lbs, optional)
- **Deadlift** (lbs, optional)
- **Power Clean** (lbs, optional)
- Used for percentage-based training weight calculations
- Athletes can leave blank and enter later via profile

## Auto-Generated Programs (Path B only)

### Program Templates by Goal

| Goal | Program Name | Structure | Duration |
|------|-------------|-----------|----------|
| Strength | Strength Builder | Squat/Bench/Deadlift focus days + accessories | 5 days |
| Hypertrophy | Hypertrophy Program | Push/Pull/Legs split | 6 days |
| Athletic Performance | Athletic Performance | Power/Upper/Conditioning/Lower/Skills | 5 days |
| General Fitness | General Fitness | Full Body A/B/C + cardio | 5 days |

### Experience Level Adjustments
- **Beginner**: Lower percentages (60-65%), standard volume (3 sets)
- **Intermediate**: Moderate percentages (70-75%), standard volume (3-4 sets)
- **Advanced**: Higher percentages (75-85%), higher volume (4 sets)

### Injury Filtering
Exercises are automatically excluded based on reported injury areas:
- **Knee**: Leg Press, Leg Extension, Box Jumps, Lunges
- **Shoulder**: Overhead Press, Lateral Raises, Weighted Dips
- **Back**: Deadlift, Romanian Deadlift, Barbell Row, Power Clean
- **Wrist**: Power Clean, Front Squat, Barbell Curl
- **Ankle**: Box Jumps, Sprints, Agility Drills, Calf Raises
- **Hip**: Bulgarian Split Squats, Lunges, Glute Bridge

## Technical Flow

```
Signup → POST /api/auth/signup
  ↓
Save token + user to localStorage
Set has_coach flag if invite_code provided
  ↓
Redirect → /athlete/onboarding
  ↓
Complete 4 steps → POST /api/athletes/onboarding
  {sport, team, training_goals, injuries, experience_level, maxes, has_coach}
  ↓
Backend:
  1. Updates user profile fields
  2. Creates AthleteMax rows
  3. Sets onboarding_completed = true
  4. If !has_coach → generates starter program with materialized workouts
  ↓
Frontend refreshes user data (GET /api/auth/me)
  ↓
Redirect → /athlete/home
```

## Login Guard
On login, if `onboarding_completed === false`, athlete is redirected to `/athlete/onboarding` instead of `/athlete/home`.

## Coach Onboarding Settings

Coaches can configure which onboarding fields athletes skip via `PUT /api/coaches/onboarding-settings`.

Skippable fields: `sport`, `team`, `training_goals`, `injuries`, `experience_level`, `maxes`

When an athlete signs up with an invite code, the frontend calls `GET /api/coaches/onboarding-config/{invite_code}` to get the coach's skip_fields list, then hides those steps/inputs in the wizard.

Settings are stored on the coach's User record as `coach_onboarding_skip_fields` (JSON text).

## Database Fields Added
- `users.injuries` (Text, nullable) — free-text injury notes
- `users.experience_level` (String, nullable) — beginner/intermediate/advanced
- `users.onboarding_completed` (Boolean, default false)
- `users.coach_onboarding_skip_fields` (Text, nullable) — JSON array of field names to skip (coach only)

## API Changes
- `POST /api/athletes/onboarding` — accepts `injuries`, `experience_level`, `has_coach`
- `GET /api/auth/me` — includes `injuries`, `experience_level`, `onboarding_completed`, `coach_name`, `coach_id`
- `POST /api/athletes/join-coach` — connect to coach via invite code (post-signup)
- `GET /api/coaches/onboarding-settings` — get coach's skip fields
- `PUT /api/coaches/onboarding-settings` — update coach's skip fields
- `GET /api/coaches/onboarding-config/{invite_code}` — public endpoint for athlete onboarding
