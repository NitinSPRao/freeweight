import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { athleteApi, Exercise, TodayWorkout } from '../../api/endpoints';
import RestTimer from '../../components/RestTimer';
import RPESlider from '../../components/RPESlider';

type Props = NativeStackScreenProps<RootStackParamList, 'Workout'>;

interface SetState {
  weight: string;
  reps: string;
  logged: boolean;
}

interface ExerciseLog {
  sets: SetState[];
}

function initLogs(exercises: Exercise[]): ExerciseLog[] {
  return exercises.map((ex) => ({
    sets: Array.from({ length: ex.sets }, () => ({
      weight: ex.target_weight ? String(Math.round(ex.target_weight)) : '',
      reps: String(ex.reps),
      logged: false,
    })),
  }));
}

export default function WorkoutScreen({ route, navigation }: Props) {
  const { workoutId, workoutName } = route.params;

  const [workout, setWorkout] = useState<TodayWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0);
  const [currentSetIdx, setCurrentSetIdx] = useState(0);
  const [workoutLogId, setWorkoutLogId] = useState<number | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [showFlagForm, setShowFlagForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Rest timer state
  const [showRestTimer, setShowRestTimer] = useState(false);

  // Debrief state
  const [debriefRpe, setDebriefRpe] = useState<number | null>(null);
  const [debriefNotes, setDebriefNotes] = useState('');

  useEffect(() => {
    athleteApi
      .getWorkout(workoutId)
      .then((r) => {
        setWorkout(r.data);
        setExerciseLogs(initLogs(r.data.exercises));
        if (r.data.workout_log_id) {
          setWorkoutLogId(r.data.workout_log_id);
          setIsStarted(true);
        }
        if (r.data.is_completed) {
          setIsComplete(true);
        }
      })
      .catch(() => Alert.alert('Error', 'Could not load workout.'))
      .finally(() => setLoading(false));
  }, [workoutId]);

  const currentExercise = workout?.exercises[currentExerciseIdx];
  const currentLog = exerciseLogs[currentExerciseIdx];
  const currentSet = currentLog?.sets[currentSetIdx];

  const allExercisesComplete =
    exerciseLogs.length > 0 &&
    exerciseLogs.every((log) => log.sets.every((s) => s.logged));
  const totalSets = exerciseLogs.reduce((sum, log) => sum + log.sets.length, 0);
  const completedSets = exerciseLogs.reduce(
    (sum, log) => sum + log.sets.filter((s) => s.logged).length,
    0
  );
  const completionProgress = totalSets > 0 ? completedSets / totalSets : 0;

  const isLastSetOfLastExercise =
    currentExerciseIdx === (workout?.exercises.length ?? 1) - 1 &&
    currentSetIdx === (currentLog?.sets.length ?? 1) - 1;

  const startWorkout = async () => {
    try {
      const res = await athleteApi.startWorkout(workoutId);
      setWorkoutLogId(res.data.workout_log_id);
      setIsStarted(true);
    } catch {
      Alert.alert('Error', 'Failed to start workout.');
    }
  };

  const logCurrentSet = async () => {
    if (!currentExercise || !currentSet) return;

    const weight = parseFloat(currentSet.weight);
    const reps = parseInt(currentSet.reps, 10);

    if (!weight || weight <= 0) {
      Alert.alert('Invalid weight', 'Enter the weight you used.');
      return;
    }
    if (!reps || reps <= 0) {
      Alert.alert('Invalid reps', 'Enter the reps you completed.');
      return;
    }

    setSubmitting(true);
    try {
      if (!isStarted) {
        const res = await athleteApi.startWorkout(workoutId);
        setWorkoutLogId(res.data.workout_log_id);
        setIsStarted(true);
      }

      await athleteApi.logSet(workoutId, {
        exercise_id: currentExercise.id,
        set_number: currentSetIdx + 1,
        weight_used: weight,
        reps_completed: reps,
      });

      // Mark set as logged
      const updated = exerciseLogs.map((el, ei) => {
        if (ei !== currentExerciseIdx) return el;
        return {
          sets: el.sets.map((s, si) =>
            si === currentSetIdx ? { ...s, logged: true } : s
          ),
        };
      });
      setExerciseLogs(updated);

      // Check if this was the last set of the last exercise
      const wasLastSet = isLastSetOfLastExercise;

      // Advance
      const nextSet = currentSetIdx + 1;
      if (nextSet < currentLog.sets.length) {
        setCurrentSetIdx(nextSet);
      } else {
        const nextEx = currentExerciseIdx + 1;
        if (nextEx < (workout?.exercises.length ?? 0)) {
          setCurrentExerciseIdx(nextEx);
          setCurrentSetIdx(0);
        }
      }

      // Show rest timer unless it was the final set
      if (!wasLastSet) {
        setShowRestTimer(true);
      }
    } catch {
      Alert.alert('Error', 'Failed to log set. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const finishWorkout = async () => {
    setSubmitting(true);
    try {
      await athleteApi.completeWorkout(workoutId, {
        notes: debriefNotes.trim() || undefined,
        rpe: debriefRpe ?? undefined,
      });
      setIsComplete(true);
    } catch {
      Alert.alert('Error', 'Failed to complete workout.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitFlag = async () => {
    if (!flagReason.trim()) {
      Alert.alert('Required', 'Describe the issue for your coach.');
      return;
    }
    try {
      await athleteApi.flagWorkout(workoutId, flagReason.trim());
      setShowFlagForm(false);
      setFlagReason('');
      Alert.alert('Flagged', 'Your coach will see this note.');
    } catch {
      Alert.alert('Error', 'Failed to send flag.');
    }
  };

  const updateCurrentSet = (field: 'weight' | 'reps', value: string) => {
    setExerciseLogs((prev) =>
      prev.map((el, ei) => {
        if (ei !== currentExerciseIdx) return el;
        return {
          sets: el.sets.map((s, si) =>
            si === currentSetIdx ? { ...s, [field]: value } : s
          ),
        };
      })
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#B4F000" size="large" />
      </View>
    );
  }

  if (!workout) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Could not load workout.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0A0A0A' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backArrow}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          Exercise {Math.min(currentExerciseIdx + 1, workout.exercises.length)} of {workout.exercises.length}
        </Text>
        <TouchableOpacity onPress={() => setShowFlagForm(true)} style={styles.flagButton}>
          <Text style={styles.flagButtonText}>⚑ Flag</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(completionProgress * 100)}%` }]} />
      </View>

      {/* Completed state */}
      {isComplete ? (
        <View style={styles.completedContainer}>
          <Text style={styles.completedIcon}>✓</Text>
          <Text style={styles.completedTitle}>Workout Complete</Text>
          <Text style={styles.completedSub}>Great work. Session saved.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.primaryButtonText}>BACK TO HOME</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          {allExercisesComplete ? (
            /* Debrief — RPE + notes before finishing */
            <View style={styles.debriefContainer}>
              <Text style={styles.debriefTitle}>Session Debrief</Text>
              <Text style={styles.debriefSub}>How did this workout feel?</Text>

              <View style={styles.debriefSection}>
                <RPESlider value={debriefRpe} onChange={setDebriefRpe} />
              </View>

              <View style={styles.debriefSection}>
                <Text style={styles.debriefLabel}>NOTES (OPTIONAL)</Text>
                <TextInput
                  style={styles.debriefInput}
                  placeholder="Any thoughts on the session..."
                  placeholderTextColor="#5A6572"
                  value={debriefNotes}
                  onChangeText={setDebriefNotes}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={finishWorkout}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#14181C" />
                ) : (
                  <Text style={styles.primaryButtonText}>FINISH WORKOUT</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipDebriefButton}
                onPress={() => {
                  setDebriefRpe(null);
                  setDebriefNotes('');
                  finishWorkout();
                }}
              >
                <Text style={styles.skipDebriefText}>Skip debrief</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Active exercise view */
            <View style={styles.activeExercise}>
              {/* Exercise info */}
              <View style={styles.exerciseInfo}>
                <Text style={styles.exerciseName}>{currentExercise?.name}</Text>
                <Text style={styles.exerciseScheme}>
                  {currentExercise?.sets} sets • {currentExercise?.reps} reps
                  {currentExercise?.target_weight
                    ? ` • ${Math.round(currentExercise.target_weight)} lbs`
                    : ''}
                </Text>

                {/* Workout description */}
                {workout.description && currentExerciseIdx === 0 && (
                  <View style={styles.descriptionCard}>
                    <Text style={styles.descriptionText}>{workout.description}</Text>
                  </View>
                )}

                {currentExercise?.video_url && (
                  <View style={styles.videoCard}>
                    <View style={styles.playButton}>
                      <Text style={styles.playIcon}>▶</Text>
                    </View>
                    <Text style={styles.videoLabel}>Form Video</Text>
                  </View>
                )}
              </View>

              {/* Set logger */}
              <View style={styles.setLogger}>
                <Text style={styles.setSectionTitle}>Sets to Complete</Text>

                {currentLog?.sets.map((set, idx) => {
                  const isCurrentSet = idx === currentSetIdx;
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.setCard,
                        set.logged && styles.setCardDone,
                        isCurrentSet && styles.setCardCurrent,
                      ]}
                    >
                      <View style={styles.setNumberCircle}>
                        <Text style={styles.setNumberText}>{idx + 1}</Text>
                      </View>
                      <View style={styles.setContent}>
                        {isCurrentSet && !set.logged ? (
                          <View style={styles.inlineInputs}>
                            <TextInput
                              style={styles.inlineInput}
                              value={set.weight}
                              onChangeText={(v) => updateCurrentSet('weight', v)}
                              keyboardType="numeric"
                              placeholder="Weight"
                              placeholderTextColor="#666"
                            />
                            <Text style={styles.inlineDot}>•</Text>
                            <TextInput
                              style={styles.inlineInput}
                              value={set.reps}
                              onChangeText={(v) => updateCurrentSet('reps', v)}
                              keyboardType="numeric"
                              placeholder="Reps"
                              placeholderTextColor="#666"
                            />
                          </View>
                        ) : (
                          <Text style={styles.setMetaText}>
                            {set.reps} reps • {set.weight || '0'} lbs
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}

                {currentExercise?.coach_notes && (
                  <View style={styles.notesSection}>
                    <Text style={styles.notesSectionTitle}>Coach Notes</Text>
                    <View style={styles.notesCard}>
                      <Text style={styles.notesText}>{currentExercise.coach_notes}</Text>
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
                  onPress={logCurrentSet}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#14181C" />
                  ) : (
                    <Text style={styles.primaryButtonText}>✓ Completed</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Rest Timer */}
      <RestTimer
        visible={showRestTimer}
        onDismiss={() => setShowRestTimer(false)}
      />

      {/* Flag form overlay */}
      {showFlagForm && (
        <View style={styles.flagOverlay}>
          <View style={styles.flagCard}>
            <Text style={styles.flagTitle}>Flag an Issue</Text>
            <Text style={styles.flagSub}>Your coach will see this note.</Text>
            <TextInput
              style={styles.flagInput}
              placeholder="Describe the issue..."
              placeholderTextColor="#5A6572"
              value={flagReason}
              onChangeText={setFlagReason}
              multiline
              numberOfLines={4}
              autoFocus
            />
            <TouchableOpacity style={styles.primaryButton} onPress={submitFlag}>
              <Text style={styles.primaryButtonText}>SEND FLAG</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setShowFlagForm(false);
                setFlagReason('');
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  backLink: {
    color: '#C8FF00',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 54,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#0A0A0A',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2E',
  },
  backArrow: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  flagButton: {
    width: 48,
    alignItems: 'flex-end',
  },
  flagButtonText: {
    color: '#FF4D4F',
    fontSize: 12,
    fontWeight: '600',
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#1C1C1E',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#C8FF00',
  },
  activeExercise: {
    flex: 1,
  },
  exerciseInfo: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  exerciseName: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  exerciseScheme: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 18,
  },
  descriptionCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#C8FF00',
  },
  descriptionText: {
    fontSize: 13,
    color: '#B0B0B0',
    lineHeight: 20,
  },
  videoCard: {
    height: 150,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  playButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#C8FF00',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  playIcon: {
    color: '#0A0A0A',
    fontSize: 20,
    fontWeight: '800',
    marginLeft: 2,
  },
  videoLabel: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '600',
  },
  setLogger: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
  },
  setSectionTitle: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 12,
  },
  setCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#252528',
  },
  setCardCurrent: {
    borderColor: '#C8FF00',
  },
  setCardDone: {
    opacity: 0.55,
  },
  setNumberCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#C8FF00',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  setNumberText: {
    color: '#0A0A0A',
    fontWeight: '800',
    fontSize: 14,
  },
  setContent: {
    flex: 1,
  },
  inlineInputs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inlineInput: {
    flex: 1,
    backgroundColor: '#101012',
    borderColor: '#2A2A2E',
    borderWidth: 1,
    borderRadius: 12,
    color: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  inlineDot: {
    marginHorizontal: 8,
    color: '#888888',
    fontSize: 14,
  },
  setMetaText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  notesSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  notesSectionTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  notesCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 14,
  },
  notesText: {
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#C8FF00',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#0A0A0A',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
  // Debrief
  debriefContainer: {
    padding: 24,
    gap: 16,
  },
  debriefTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  debriefSub: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 8,
  },
  debriefSection: {
    marginBottom: 8,
  },
  debriefLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5A6572',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  debriefInput: {
    backgroundColor: '#1C1C1E',
    color: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#252528',
  },
  skipDebriefButton: {
    padding: 14,
    alignItems: 'center',
  },
  skipDebriefText: {
    color: '#5A6572',
    fontSize: 13,
  },
  // Completed
  completedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  completedIcon: {
    fontSize: 56,
    color: '#C8FF00',
  },
  completedTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  completedSub: {
    fontSize: 15,
    color: '#888888',
    marginBottom: 16,
  },
  // Finish
  finishContainer: {
    padding: 24,
    gap: 12,
    alignItems: 'center',
  },
  finishTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  finishSub: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 8,
  },
  // Flag
  flagOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: 20,
    paddingBottom: 40,
  },
  flagCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    gap: 12,
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  flagTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  flagSub: {
    fontSize: 13,
    color: '#888888',
  },
  flagInput: {
    backgroundColor: '#101012',
    color: '#FFFFFF',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  cancelButton: {
    padding: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#888888',
    fontSize: 14,
  },
});
