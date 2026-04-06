# FreeWeight Web Application

A desktop and mobile web application for FreeWeight - the complete strength training platform for athletes and coaches.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS (with custom theme matching style guide)
- **State Management:** TanStack React Query
- **API Client:** Axios
- **Forms:** React Hook Form
- **Date Utilities:** date-fns

## Project Structure

```
web/
├── app/
│   ├── (auth)/
│   │   ├── login/          # Login page
│   │   └── signup/         # Signup page
│   ├── athlete/            # Athlete dashboard pages
│   ├── coach/
│   │   ├── dashboard/      # Coach dashboard
│   │   ├── roster/         # Athlete roster + group management panel
│   │   ├── athletes/[id]/  # Athlete detail (injuries, history, delete)
│   │   ├── programs/
│   │   │   ├── page.tsx        # Programs list (tabs, ⋯ menu, modal)
│   │   │   ├── create/         # Manual program builder
│   │   │   ├── import/         # Spreadsheet → AI import flow
│   │   │   └── [id]/           # Program detail + edit
│   │   ├── onboarding/     # Coach onboarding
│   │   └── profile/        # Coach profile
│   ├── globals.css         # Global styles + Tailwind
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page (redirects)
│   └── providers.tsx       # React Query provider
├── components/
│   ├── AuthGuard.tsx       # Authentication wrapper
│   ├── AuthFromUrl.tsx      # Handles token-in-URL login flow
│   ├── NavBar.tsx          # Navigation bar
│   ├── AthleteStatusPanel.tsx  # Quick-status panel for coach dashboard
│   └── RestTimer.tsx       # Rest timer overlay for workout logging
├── lib/
│   ├── api-client.ts       # Axios configuration + auth interceptors
│   ├── api-endpoints.ts    # All API endpoint definitions (typed)
│   ├── auth.ts             # Authentication utilities (localStorage)
│   └── utils.ts            # Helper functions
└── package.json
```

## Getting Started

### 1. Install Dependencies

```bash
cd web
npm install
```

### 2. Environment Setup

Create `.env.local` file (already created):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Features Implemented

### ✅ Completed

**Auth & Accounts**
- Authentication system (login/signup) with JWT token management
- Token-in-URL login flow (`AuthFromUrl`) for invite links
- Invite code persists through onboarding and after logout/login
- Auth guards for all protected routes

**Athlete Interface**
- Athlete home page with today's workout
- Workout logging with set-by-set tracking and RPE
- Rest timer overlay between sets
- Calendar view of scheduled workouts
- Progress tracking (lifts over time)
- Strength goal setting
- Profile editing

**Coach Interface**
- Coach dashboard with completion stats and flagged workouts
- Roster management with athlete status panel (active/idle/flagged/new)
- Athlete detail page: maxes, recent workouts, injuries, remove/delete athlete
- Group and subgroup management panel on the roster page (add/remove members, assign programs to group)
- Invite code system for connecting athletes to coaches

**Programs**
- Full program builder: create programs with workouts and exercises
- Program list page with browser-style Active/Archived tabs (with live counts), ⋯ three-dot card menu, single "Open" button per card
- "New Program" button opens a modal to choose between manual creation and spreadsheet import
- Program archiving and restore (hidden from active list, viewable under Archived tab)
- Program duplication via ⋯ menu
- Program deletion (permanent, with full cascade) via ⋯ menu
- Program assignment to individual athletes, groups, or subgroups with date-based scheduling

**Spreadsheet Import (AI-powered)**
- Coaches upload `.xlsx` files at `/coach/programs/import`
- Gemini AI parses arbitrary spreadsheet layouts into structured programs
- Preview step shows parsed workouts and exercises in collapsible cards with editable name/description
- Feedback loop: "Something's Wrong" button reveals multi-select issue checkboxes and a free-text field; "Re-parse" sends feedback + original file back to AI for a corrected result
- Parsed program is saved to the database in one click

### 📋 To Do
- Athlete-facing program browsing
- Push notifications for flagged workouts

## Color Theme (from STYLE_GUIDE.md)

- **Primary:** `#B4F000` - Main actions, buttons, links
- **Secondary:** `#5A6572` - Supporting accents
- **Accent:** `#E6EDF3` - Text, highlights
- **Background:** `#14181C` - Page canvas
- **Text:** `#E6EDF3` - Body text
- **Error:** `#FF4D4F` - Error states

## API Integration

All API endpoints are defined in `lib/api-endpoints.ts` with full TypeScript support:

- **Authentication:** login, signup, getMe, updateMe, uploadPhoto
- **Athlete:** onboarding, maxes, calendar, workouts, set logging, completion, flagging, progress, profile
- **Coach:** dashboard, roster, athlete detail, athlete statuses, groups, subgroups, workout log acknowledgement
- **Programs:** list (active/archived), get, create, update, delete, archive, restore, duplicate, add/update/delete workouts and exercises, assign, parse (AI), import

## Development Notes

- Uses localStorage for token storage (client-side only)
- Automatic redirect on 401 responses
- Mobile-first responsive design
- Type-safe API calls throughout

## Next Steps

1. Install dependencies: `npm install`
2. Start backend: `cd ../backend && uv run uvicorn app.main:app --reload`
3. Start web app: `npm run dev`
