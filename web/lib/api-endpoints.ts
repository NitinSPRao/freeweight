import apiClient from "./api-client";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AthleteMax {
  id: number;
  exercise_name: string;
  max_weight: number;
  unit: string;
  recorded_at: string;
  updated_at: string;
}

export interface Exercise {
  id: number;
  name: string;
  sets: number;
  reps: number;
  percentage_of_max?: number;
  target_exercise?: string;
  video_url?: string;
  coach_notes?: string;
  order: number;
}

export interface Workout {
  id: number;
  name: string;
  scheduled_date: string;
  day_offset?: number;
  exercises: Exercise[];
  workout_log_id?: number;
  is_completed?: boolean;
  is_flagged?: boolean;
  athlete_modified?: boolean;
  modification_notes?: string;
}

export interface Program {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  updated_at?: string;
  archived?: boolean;
  workouts: Workout[];
}

export interface WorkoutLog {
  id: number;
  workout_id: number;
  workout_name: string;
  completed_at?: string;
  is_completed: boolean;
  has_modifications: boolean;
  notes?: string;
  is_flagged: boolean;
  flag_reason?: string;
  coach_acknowledged: boolean;
  coach_response?: string;
}

export interface SetLog {
  id: number;
  set_number: number;
  weight_used: number;
  reps_completed: number;
  rpe?: number;
  notes?: string;
  video_url?: string;
  was_modified: boolean;
}

export interface StrengthGoal {
  id: number;
  exercise_name: string;
  starting_weight: number;
  target_weight: number;
  target_date: string;
  created_at: string;
}

export interface ProgressData {
  exercise_name: string;
  current_max?: number;
  data: Array<{ date: string; max_weight: number }>;
  goal?: StrengthGoal;
}

export interface AthleteProfile {
  id: number;
  name: string;
  email: string;
  sport?: string;
  team?: string;
  training_goals?: string;
  injuries?: string;
  maxes: AthleteMax[];
  recent_workouts: WorkoutLog[];
}

export interface Group {
  id: number;
  name: string;
  sport?: string;
  member_count: number;
  subgroups: Subgroup[];
}

export interface Subgroup {
  id: number;
  name: string;
  training_focus?: string;
  member_count: number;
}

export interface CoachDashboard {
  completed_today: number;
  flagged_workouts: number;
  total_athletes: number;
  flagged_athletes: Array<{
    id: number;
    name: string;
    workout_name: string;
    flag_reason: string;
  }>;
}

export interface AthleteStatus {
  id: number;
  name: string;
  profile_photo_url?: string;
  sport?: string;
  status: "active" | "idle" | "flagged" | "new";
  last_workout_name?: string;
  last_workout_date?: string;
  workouts_this_week: number;
  has_flagged: boolean;
}

// ============================================================================
// ATHLETE API
// ============================================================================

export const athleteApi = {
  onboarding: async (data: {
    sport?: string;
    team?: string;
    training_goals?: string;
    injuries?: string;
    experience_level?: string;
    maxes?: Record<string, number>;
    has_coach: boolean;
    goals?: Record<string, { target_weight: number; target_date: string }>;
  }) => {
    const response = await apiClient.post("/api/athletes/onboarding", data);
    return response.data;
  },

  updateMax: async (exercise_name: string, max_weight: number, unit: string = "lbs") => {
    const response = await apiClient.put("/api/athletes/maxes", {
      exercise_name,
      max_weight,
      unit,
    });
    return response.data;
  },

  editWorkout: async (workoutId: number, data: {
    name?: string;
    exercises?: Array<{
      id?: number;
      name: string;
      sets: number;
      reps: number;
      percentage_of_max?: number;
      target_exercise?: string;
      coach_notes?: string;
      order: number;
    }>;
    modification_notes?: string;
  }) => {
    const response = await apiClient.put<Workout>(`/api/athletes/workouts/${workoutId}`, data);
    return response.data;
  },

  getCalendar: async (start_date?: string, end_date?: string) => {
    const params = new URLSearchParams();
    if (start_date) params.append("start_date", start_date);
    if (end_date) params.append("end_date", end_date);

    const response = await apiClient.get<Workout[]>(
      `/api/athletes/calendar?${params.toString()}`
    );
    return response.data;
  },

  getTodayWorkout: async () => {
    const response = await apiClient.get<Workout>("/api/athletes/workouts/today");
    return response.data;
  },

  getWorkout: async (workoutId: number) => {
    const response = await apiClient.get<Workout>(`/api/athletes/workouts/${workoutId}`);
    return response.data;
  },

  startWorkout: async (workoutId: number) => {
    const response = await apiClient.post(`/api/athletes/workouts/${workoutId}/start`);
    return response.data;
  },

  logSet: async (workoutId: number, data: {
    exercise_id: number;
    set_number: number;
    weight_used: number;
    reps_completed: number;
    rpe?: number;
    notes?: string;
  }) => {
    const response = await apiClient.post(`/api/athletes/workouts/${workoutId}/sets`, data);
    return response.data;
  },

  completeWorkout: async (workoutId: number, notes?: string) => {
    const response = await apiClient.post(`/api/athletes/workouts/${workoutId}/complete`, {
      notes,
    });
    return response.data;
  },

  flagWorkout: async (workoutId: number, reason: string) => {
    const response = await apiClient.post(`/api/athletes/workouts/${workoutId}/flag`, {
      reason,
    });
    return response.data;
  },

  getHistory: async () => {
    const response = await apiClient.get<WorkoutLog[]>("/api/athletes/history");
    return response.data;
  },

  getProgress: async () => {
    const response = await apiClient.get<ProgressData[]>("/api/athletes/progress");
    return response.data;
  },

  updateProfile: async (data: { name?: string; sport?: string; team?: string; training_goals?: string; injuries?: string; experience_level?: string }) => {
    const response = await apiClient.put("/api/athletes/profile", data);
    return response.data;
  },

  uploadPhoto: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await apiClient.post<{ profile_photo_url: string }>(
      "/api/athletes/profile/photo",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    return response.data;
  },

  changeCoach: async (invite_code: string) => {
    const response = await apiClient.put("/api/athletes/coach", { invite_code });
    return response.data;
  },

  createWorkout: async (data: {
    name: string;
    description?: string;
    scheduled_date: string;
    exercises: Array<{
      name: string;
      sets: number;
      reps: number;
      percentage_of_max?: number;
      target_exercise?: string;
      coach_notes?: string;
      order: number;
    }>;
  }) => {
    const response = await apiClient.post<Workout>("/api/athletes/workouts", data);
    return response.data;
  },
};

// ============================================================================
// COACH API
// ============================================================================

export const coachApi = {
  getDashboard: async () => {
    const response = await apiClient.get<CoachDashboard>("/api/coaches/dashboard");
    return response.data;
  },

  getRoster: async () => {
    const response = await apiClient.get<{ athletes: AthleteProfile[] }>("/api/coaches/roster");
    return response.data;
  },

  getAthleteDetail: async (athleteId: number) => {
    const response = await apiClient.get<AthleteProfile>(`/api/coaches/athletes/${athleteId}`);
    return response.data;
  },

  getAthleteStatuses: async () => {
    const response = await apiClient.get<{ athletes: AthleteStatus[] }>("/api/coaches/athlete-statuses");
    return response.data.athletes;
  },

  getInviteCode: async () => {
    const response = await apiClient.get<{ invite_code: string }>("/api/coaches/invite-code");
    return response.data;
  },

  // Group Management
  listGroups: async () => {
    const response = await apiClient.get<Group[]>("/api/coaches/groups");
    return response.data;
  },

  createGroup: async (name: string, sport?: string) => {
    const response = await apiClient.post("/api/coaches/groups", { name, sport });
    return response.data;
  },

  updateGroup: async (groupId: number, name: string) => {
    const response = await apiClient.put(`/api/coaches/groups/${groupId}`, { name });
    return response.data;
  },

  deleteGroup: async (groupId: number) => {
    const response = await apiClient.delete(`/api/coaches/groups/${groupId}`);
    return response.data;
  },

  addGroupMembers: async (groupId: number, athlete_ids: number[]) => {
    const response = await apiClient.post(`/api/coaches/groups/${groupId}/members`, {
      athlete_ids,
    });
    return response.data;
  },

  removeGroupMembers: async (groupId: number, athlete_ids: number[]) => {
    const response = await apiClient.delete(`/api/coaches/groups/${groupId}/members`, {
      data: { athlete_ids },
    });
    return response.data;
  },

  acknowledgeWorkoutLog: async (logId: number, coach_response?: string) => {
    const response = await apiClient.post(`/api/coaches/workout-logs/${logId}/acknowledge`, {
      coach_response: coach_response ?? null,
    });
    return response.data;
  },

  // Subgroup Management
  createSubgroup: async (groupId: number, name: string, training_focus?: string) => {
    const response = await apiClient.post(`/api/coaches/groups/${groupId}/subgroups`, {
      name,
      training_focus,
    });
    return response.data;
  },

  updateSubgroup: async (subgroupId: number, name: string) => {
    const response = await apiClient.put(`/api/coaches/subgroups/${subgroupId}`, { name });
    return response.data;
  },

  deleteSubgroup: async (subgroupId: number) => {
    const response = await apiClient.delete(`/api/coaches/subgroups/${subgroupId}`);
    return response.data;
  },

  addSubgroupMembers: async (subgroupId: number, athlete_ids: number[]) => {
    const response = await apiClient.post(`/api/coaches/subgroups/${subgroupId}/members`, {
      athlete_ids,
    });
    return response.data;
  },

  removeSubgroupMembers: async (subgroupId: number, athlete_ids: number[]) => {
    const response = await apiClient.delete(`/api/coaches/subgroups/${subgroupId}/members`, {
      data: { athlete_ids },
    });
    return response.data;
  },
};

// ============================================================================
// PROGRAM API
// ============================================================================

export const programApi = {
  list: async (include_archived: boolean = false) => {
    const response = await apiClient.get<Program[]>(
      `/api/programs?include_archived=${include_archived}`
    );
    return response.data;
  },

  listArchived: async () => {
    const response = await apiClient.get<Program[]>("/api/programs/archived");
    return response.data;
  },

  get: async (programId: number) => {
    const response = await apiClient.get<Program>(`/api/programs/${programId}`);
    return response.data;
  },

  create: async (data: { name: string; description?: string }) => {
    const response = await apiClient.post<Program>("/api/programs", data);
    return response.data;
  },

  update: async (programId: number, data: { name?: string; description?: string }) => {
    const response = await apiClient.put<Program>(`/api/programs/${programId}`, data);
    return response.data;
  },

  archive: async (programId: number) => {
    const response = await apiClient.post(`/api/programs/${programId}/archive`);
    return response.data;
  },

  restore: async (programId: number) => {
    const response = await apiClient.post(`/api/programs/${programId}/restore`);
    return response.data;
  },

  addWorkout: async (programId: number, data: {
    name: string;
    day_offset: number;
  }) => {
    const response = await apiClient.post(`/api/programs/${programId}/workouts`, data);
    return response.data;
  },

  updateWorkout: async (workoutId: number, data: { name?: string; day_offset?: number }) => {
    const response = await apiClient.put(`/api/programs/workouts/${workoutId}`, data);
    return response.data;
  },

  deleteWorkout: async (workoutId: number) => {
    const response = await apiClient.delete(`/api/programs/workouts/${workoutId}`);
    return response.data;
  },

  addExercise: async (workoutId: number, data: {
    name: string;
    sets: number;
    reps: number;
    percentage_of_max?: number;
    target_exercise?: string;
    video_url?: string;
    coach_notes?: string;
    order: number;
  }) => {
    const response = await apiClient.post(`/api/programs/workouts/${workoutId}/exercises`, data);
    return response.data;
  },

  updateExercise: async (exerciseId: number, data: {
    name?: string;
    sets?: number;
    reps?: number;
    percentage_of_max?: number;
    target_exercise?: string;
    video_url?: string;
    coach_notes?: string;
    order?: number;
  }) => {
    const response = await apiClient.put(`/api/programs/exercises/${exerciseId}`, data);
    return response.data;
  },

  deleteExercise: async (exerciseId: number) => {
    const response = await apiClient.delete(`/api/programs/exercises/${exerciseId}`);
    return response.data;
  },

  assign: async (programId: number, data: {
    start_date: string;
    athlete_id?: number;
    group_id?: number;
    subgroup_id?: number;
  }) => {
    const response = await apiClient.post(`/api/programs/${programId}/assign`, data);
    return response.data;
  },
};
