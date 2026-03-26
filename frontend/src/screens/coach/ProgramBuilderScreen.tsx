import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { programsApi, coachApi, AthleteWithGroups } from '../../api/endpoints';
import ExercisePicker from '../../components/ExercisePicker';

type Props = NativeStackScreenProps<RootStackParamList, 'ProgramBuilder'>;

const ACCENT = '#4df0c8';

interface ExerciseForm {
  name: string;
  sets: string;
  reps: string;
  percentage_of_max: string;
  target_exercise: string;
  coach_notes: string;
}

interface SessionForm {
  name: string;
  day_offset: string;
  exercises: ExerciseForm[];
}

const TARGET_LIFTS = ['squat', 'deadlift', 'bench', 'clean', 'press'];

const blankExercise = (): ExerciseForm => ({
  name: '',
  sets: '3',
  reps: '5',
  percentage_of_max: '',
  target_exercise: '',
  coach_notes: '',
});

export default function ProgramBuilderScreen({ navigation }: Props) {
  const queryClient = useQueryClient();

  // Program form
  const [programName, setProgramName] = useState('');
  const [programDescription, setProgramDescription] = useState('');
  const [sessions, setSessions] = useState<SessionForm[]>([]);

  // Session form state
  const [showAddSession, setShowAddSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionDay, setNewSessionDay] = useState('1');
  const [expandedSession, setExpandedSession] = useState<number | null>(null);

  // Exercise form state
  const [addingExerciseToSession, setAddingExerciseToSession] = useState<number | null>(null);
  const [newExercise, setNewExercise] = useState<ExerciseForm>(blankExercise());

  // Assign form state (shown after program is created)
  const [createdProgramId, setCreatedProgramId] = useState<number | null>(null);
  const [assignStartDate, setAssignStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  const { data: roster = [] } = useQuery({
    queryKey: ['coachRoster'],
    queryFn: () => coachApi.getRoster().then((r) => r.data.athletes),
  });

  const addSession = () => {
    const name = newSessionName.trim();
    const day = parseInt(newSessionDay, 10);
    if (!name) {
      Alert.alert('Required', 'Give this session a name.');
      return;
    }
    if (!day || day < 1) {
      Alert.alert('Invalid day', 'Day offset must be at least 1.');
      return;
    }
    setSessions((prev) => [...prev, { name, day_offset: String(day), exercises: [] }]);
    setNewSessionName('');
    setNewSessionDay(String(day + 2));
    setShowAddSession(false);
    setExpandedSession(sessions.length); // expand the newly added session
  };

  const addExercise = (sessionIdx: number) => {
    const ex = { ...newExercise };
    if (!ex.name.trim()) {
      Alert.alert('Required', 'Enter an exercise name.');
      return;
    }
    if (!parseInt(ex.sets) || !parseInt(ex.reps)) {
      Alert.alert('Invalid', 'Sets and reps must be numbers.');
      return;
    }
    setSessions((prev) =>
      prev.map((s, i) =>
        i === sessionIdx ? { ...s, exercises: [...s.exercises, ex] } : s
      )
    );
    setNewExercise(blankExercise());
    setAddingExerciseToSession(null);
  };

  const createProgram = async () => {
    if (!programName.trim()) {
      Alert.alert('Required', 'Give your program a name.');
      return;
    }
    if (sessions.length === 0) {
      Alert.alert('Required', 'Add at least one session.');
      return;
    }

    setIsCreating(true);
    try {
      // 1. Create program
      const programRes = await programsApi.create({
        name: programName.trim(),
        description: programDescription.trim() || undefined,
      });
      const programId = programRes.data.id;

      // 2. Add each session + exercises
      for (const session of sessions) {
        const workoutRes = await programsApi.addWorkout(programId, {
          name: session.name,
          day_offset: parseInt(session.day_offset),
        });
        const workoutId = workoutRes.data.id;

        for (let i = 0; i < session.exercises.length; i++) {
          const ex = session.exercises[i];
          await programsApi.addExercise(workoutId, {
            name: ex.name.trim(),
            sets: parseInt(ex.sets),
            reps: parseInt(ex.reps),
            percentage_of_max: ex.percentage_of_max
              ? parseFloat(ex.percentage_of_max) / 100
              : undefined,
            target_exercise: ex.target_exercise || undefined,
            coach_notes: ex.coach_notes.trim() || undefined,
            order: i + 1,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['programs'] });
      setCreatedProgramId(programId);
    } catch {
      Alert.alert('Error', 'Failed to create program. Try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const assignProgram = async () => {
    if (!selectedAthleteId) {
      Alert.alert('Required', 'Select an athlete to assign this program to.');
      return;
    }
    if (!assignStartDate) {
      Alert.alert('Required', 'Enter a start date (YYYY-MM-DD).');
      return;
    }

    setIsAssigning(true);
    try {
      await programsApi.assign(createdProgramId!, {
        athlete_id: selectedAthleteId,
        start_date: new Date(assignStartDate).toISOString(),
      });
      Alert.alert('Assigned!', 'Program has been assigned to the athlete.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to assign program.');
    } finally {
      setIsAssigning(false);
    }
  };

  // ── Post-creation: assign form ─────────────────────────────────────────────
  if (createdProgramId !== null) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#14181C' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Assign Program</Text>
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.successBanner}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>{programName} created</Text>
          </View>

          <Text style={styles.sectionLabel}>START DATE</Text>
          <TextInput
            style={styles.input}
            value={assignStartDate}
            onChangeText={setAssignStartDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#5A6572"
          />

          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>ASSIGN TO ATHLETE</Text>
          {roster.length === 0 ? (
            <Text style={styles.mutedText}>No athletes on your roster yet.</Text>
          ) : (
            (roster as AthleteWithGroups[]).map((athlete) => (
              <TouchableOpacity
                key={athlete.id}
                style={[
                  styles.athleteOption,
                  selectedAthleteId === athlete.id && styles.athleteOptionSelected,
                ]}
                onPress={() => setSelectedAthleteId(athlete.id)}
              >
                <Text style={styles.athleteOptionText}>{athlete.name}</Text>
                {selectedAthleteId === athlete.id && (
                  <Text style={{ color: ACCENT, fontWeight: '700' }}>✓</Text>
                )}
              </TouchableOpacity>
            ))
          )}

          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: 24 }]}
            onPress={assignProgram}
            disabled={isAssigning}
          >
            {isAssigning ? (
              <ActivityIndicator color="#14181C" />
            ) : (
              <Text style={styles.primaryButtonText}>ASSIGN PROGRAM</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.skipButtonText}>Skip — assign later</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Builder form ────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#14181C' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Program</Text>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* Program info */}
        <Text style={styles.sectionLabel}>PROGRAM NAME</Text>
        <TextInput
          style={styles.input}
          value={programName}
          onChangeText={setProgramName}
          placeholder="e.g. 5/3/1 Strength Block"
          placeholderTextColor="#5A6572"
        />

        <Text style={styles.sectionLabel}>DESCRIPTION (OPTIONAL)</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={programDescription}
          onChangeText={setProgramDescription}
          placeholder="What is this program for?"
          placeholderTextColor="#5A6572"
          multiline
          numberOfLines={3}
        />

        {/* Sessions */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>
          SESSIONS ({sessions.length})
        </Text>

        {sessions.map((session, si) => (
          <View key={si} style={styles.sessionCard}>
            <TouchableOpacity
              style={styles.sessionHeader}
              onPress={() => setExpandedSession(expandedSession === si ? null : si)}
            >
              <View>
                <Text style={styles.sessionName}>{session.name}</Text>
                <Text style={styles.sessionMeta}>
                  Day {session.day_offset} · {session.exercises.length} exercise
                  {session.exercises.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <Text style={styles.chevron}>{expandedSession === si ? '∨' : '›'}</Text>
            </TouchableOpacity>

            {expandedSession === si && (
              <View style={styles.sessionBody}>
                {session.exercises.map((ex, ei) => (
                  <View key={ei} style={styles.exerciseRow}>
                    <Text style={styles.exerciseName}>{ex.name}</Text>
                    <Text style={styles.exerciseMeta}>
                      {ex.sets}×{ex.reps}
                      {ex.percentage_of_max ? ` @ ${ex.percentage_of_max}%` : ''}
                      {ex.target_exercise ? ` ${ex.target_exercise}` : ''}
                    </Text>
                  </View>
                ))}

                {addingExerciseToSession === si ? (
                  <View style={styles.addExerciseForm}>
                    <ExercisePicker
                      selectedValue={newExercise.name}
                      onSelect={(name) => setNewExercise((p) => ({ ...p, name }))}
                      placeholder="Select exercise"
                      accentColor={ACCENT}
                    />
                    <View style={styles.twoCol}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>SETS</Text>
                        <TextInput
                          style={styles.input}
                          value={newExercise.sets}
                          onChangeText={(v) => setNewExercise((p) => ({ ...p, sets: v }))}
                          keyboardType="numeric"
                          placeholder="3"
                          placeholderTextColor="#5A6572"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>REPS</Text>
                        <TextInput
                          style={styles.input}
                          value={newExercise.reps}
                          onChangeText={(v) => setNewExercise((p) => ({ ...p, reps: v }))}
                          keyboardType="numeric"
                          placeholder="5"
                          placeholderTextColor="#5A6572"
                        />
                      </View>
                    </View>
                    <View style={styles.twoCol}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>% OF MAX</Text>
                        <TextInput
                          style={styles.input}
                          value={newExercise.percentage_of_max}
                          onChangeText={(v) =>
                            setNewExercise((p) => ({ ...p, percentage_of_max: v }))
                          }
                          keyboardType="numeric"
                          placeholder="80"
                          placeholderTextColor="#5A6572"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>TARGET LIFT</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={{ marginBottom: 12 }}
                        >
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {TARGET_LIFTS.map((lift) => (
                              <TouchableOpacity
                                key={lift}
                                style={[
                                  styles.liftChip,
                                  newExercise.target_exercise === lift &&
                                    styles.liftChipActive,
                                ]}
                                onPress={() =>
                                  setNewExercise((p) => ({
                                    ...p,
                                    target_exercise:
                                      p.target_exercise === lift ? '' : lift,
                                  }))
                                }
                              >
                                <Text
                                  style={[
                                    styles.liftChipText,
                                    newExercise.target_exercise === lift &&
                                      styles.liftChipTextActive,
                                  ]}
                                >
                                  {lift}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    </View>
                    <TextInput
                      style={[styles.input, styles.multilineInput]}
                      value={newExercise.coach_notes}
                      onChangeText={(v) => setNewExercise((p) => ({ ...p, coach_notes: v }))}
                      placeholder="Coach notes (optional)"
                      placeholderTextColor="#5A6572"
                      multiline
                      numberOfLines={2}
                    />
                    <TouchableOpacity
                      style={styles.addExerciseButton}
                      onPress={() => addExercise(si)}
                    >
                      <Text style={styles.addExerciseButtonText}>ADD EXERCISE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setAddingExerciseToSession(null);
                        setNewExercise(blankExercise());
                      }}
                    >
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.addExerciseTrigger}
                    onPress={() => setAddingExerciseToSession(si)}
                  >
                    <Text style={styles.addExerciseTriggerText}>+ Add Exercise</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ))}

        {/* Add session */}
        {showAddSession ? (
          <View style={styles.addSessionForm}>
            <Text style={styles.sectionLabel}>ADD SESSION</Text>
            <TextInput
              style={styles.input}
              value={newSessionName}
              onChangeText={setNewSessionName}
              placeholder="Session name (e.g. Upper Body)"
              placeholderTextColor="#5A6572"
              autoFocus
            />
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={styles.miniLabel}>DAY NUMBER</Text>
                <TextInput
                  style={styles.input}
                  value={newSessionDay}
                  onChangeText={setNewSessionDay}
                  keyboardType="numeric"
                  placeholder="1"
                  placeholderTextColor="#5A6572"
                />
              </View>
            </View>
            <TouchableOpacity style={styles.addSessionButton} onPress={addSession}>
              <Text style={styles.addSessionButtonText}>ADD SESSION</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAddSession(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addSessionTrigger}
            onPress={() => setShowAddSession(true)}
          >
            <Text style={styles.addSessionTriggerText}>+ Add Session</Text>
          </TouchableOpacity>
        )}

        {/* Create button */}
        <TouchableOpacity
          style={[styles.primaryButton, { marginTop: 32 }]}
          onPress={createProgram}
          disabled={isCreating}
        >
          {isCreating ? (
            <ActivityIndicator color="#14181C" />
          ) : (
            <Text style={styles.primaryButtonText}>CREATE PROGRAM</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  backArrow: {
    fontSize: 20,
    color: '#E6EDF3',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#E6EDF3',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5A6572',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1F2937',
    color: '#E6EDF3',
    padding: 14,
    borderRadius: 8,
    fontSize: 15,
    marginBottom: 12,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sessionCard: {
    backgroundColor: '#1C2128',
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2D3748',
    overflow: 'hidden',
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  sessionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E6EDF3',
  },
  sessionMeta: {
    fontSize: 12,
    color: '#5A6572',
    marginTop: 2,
  },
  chevron: {
    fontSize: 18,
    color: '#5A6572',
  },
  sessionBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#2D3748',
  },
  exerciseRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2D3748',
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E6EDF3',
  },
  exerciseMeta: {
    fontSize: 12,
    color: '#5A6572',
    marginTop: 2,
  },
  addExerciseForm: {
    paddingTop: 14,
  },
  addExerciseTrigger: {
    paddingTop: 12,
    alignItems: 'center',
  },
  addExerciseTriggerText: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: '700',
  },
  addExerciseButton: {
    backgroundColor: ACCENT,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  addExerciseButtonText: {
    color: '#14181C',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 12,
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5A6572',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  liftChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  liftChipActive: {
    backgroundColor: 'rgba(77,240,200,0.1)',
    borderColor: ACCENT,
  },
  liftChipText: {
    fontSize: 11,
    color: '#5A6572',
    fontWeight: '600',
  },
  liftChipTextActive: {
    color: ACCENT,
  },
  addSessionForm: {
    backgroundColor: '#1C2128',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  addSessionTrigger: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2D3748',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: 8,
  },
  addSessionTriggerText: {
    color: '#5A6572',
    fontSize: 14,
    fontWeight: '600',
  },
  addSessionButton: {
    backgroundColor: ACCENT,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  addSessionButtonText: {
    color: '#14181C',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cancelText: {
    color: '#5A6572',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
  primaryButton: {
    backgroundColor: ACCENT,
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#14181C',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(77,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(77,240,200,0.2)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 24,
  },
  successIcon: {
    fontSize: 20,
    color: ACCENT,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: ACCENT,
  },
  athleteOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  athleteOptionSelected: {
    borderColor: ACCENT,
  },
  athleteOptionText: {
    fontSize: 15,
    color: '#E6EDF3',
    fontWeight: '500',
  },
  mutedText: {
    color: '#5A6572',
    fontSize: 14,
    marginBottom: 12,
  },
  skipButton: {
    padding: 16,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#5A6572',
    fontSize: 13,
  },
});
