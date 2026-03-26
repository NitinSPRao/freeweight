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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useAuth } from '../../hooks/useAuth';
import { athleteApi, authApi } from '../../api/endpoints';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const TOTAL_STEPS = 4;

const TRAINING_GOALS = ['Build Strength', 'Build Muscle', 'Athletic Performance', 'General Fitness'];
const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

const COLORS = {
  bg: '#14181C',
  surface: '#1F2937',
  text: '#E6EDF3',
  secondary: '#5A6572',
  accent: '#B4F000',
};

export default function OnboardingScreen({ navigation }: Props) {
  const { user, refreshUser } = useAuth();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [sport, setSport] = useState('');
  const [team, setTeam] = useState('');

  // Step 2
  const [trainingGoal, setTrainingGoal] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');

  // Step 3
  const [injuries, setInjuries] = useState('');

  // Step 4
  const [squat, setSquat] = useState('');
  const [bench, setBench] = useState('');
  const [deadlift, setDeadlift] = useState('');
  const [clean, setClean] = useState('');

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleComplete = async () => {
    setSubmitting(true);
    try {
      const maxes: Record<string, number> = {};
      const sqVal = parseFloat(squat);
      const benchVal = parseFloat(bench);
      const dlVal = parseFloat(deadlift);
      const cleanVal = parseFloat(clean);

      if (sqVal > 0) maxes.squat = sqVal;
      if (benchVal > 0) maxes.bench = benchVal;
      if (dlVal > 0) maxes.deadlift = dlVal;
      if (cleanVal > 0) maxes.clean = cleanVal;

      await athleteApi.onboarding({
        sport: sport.trim() || undefined,
        team: team.trim() || undefined,
        training_goals: trainingGoal || undefined,
        injuries: injuries.trim() || undefined,
        experience_level: experienceLevel || undefined,
        maxes: Object.keys(maxes).length > 0 ? maxes : undefined,
        has_coach: !!user?.coach_id,
        goals: {},
      });

      await refreshUser();
      navigation.replace('AthleteHome');
    } catch (err: any) {
      const message =
        err?.response?.data?.detail || err?.message || 'Something went wrong';
      Alert.alert('Onboarding Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStepDots = () => (
    <View style={styles.dotsRow}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i + 1 === step && styles.dotActive,
            i + 1 < step && styles.dotCompleted,
          ]}
        />
      ))}
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Sport & Team</Text>
      <Text style={styles.stepSubtitle}>
        Tell us about your sport background (optional)
      </Text>

      <Text style={styles.label}>Sport</Text>
      <TextInput
        style={styles.input}
        value={sport}
        onChangeText={setSport}
        placeholder="e.g. Football, Basketball, Track"
        placeholderTextColor={COLORS.secondary}
      />

      <Text style={styles.label}>Team</Text>
      <TextInput
        style={styles.input}
        value={team}
        onChangeText={setTeam}
        placeholder="e.g. Varsity, JV, Club"
        placeholderTextColor={COLORS.secondary}
      />
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Goals & Experience</Text>
      <Text style={styles.stepSubtitle}>
        What are you training for?
      </Text>

      <Text style={styles.label}>Training Goal</Text>
      <View style={styles.selectorGrid}>
        {TRAINING_GOALS.map((goal) => (
          <TouchableOpacity
            key={goal}
            style={[
              styles.selectorButton,
              trainingGoal === goal && styles.selectorButtonActive,
            ]}
            onPress={() => setTrainingGoal(goal)}
          >
            <Text
              style={[
                styles.selectorText,
                trainingGoal === goal && styles.selectorTextActive,
              ]}
            >
              {goal}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.label, { marginTop: 24 }]}>Experience Level</Text>
      <View style={styles.selectorRow}>
        {EXPERIENCE_LEVELS.map((level) => (
          <TouchableOpacity
            key={level}
            style={[
              styles.selectorButton,
              styles.selectorButtonFlex,
              experienceLevel === level && styles.selectorButtonActive,
            ]}
            onPress={() => setExperienceLevel(level)}
          >
            <Text
              style={[
                styles.selectorText,
                experienceLevel === level && styles.selectorTextActive,
              ]}
            >
              {level}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Injuries & Limitations</Text>
      <Text style={styles.stepSubtitle}>
        Anything your coach should know about? (optional)
      </Text>

      <Text style={styles.label}>Injuries or Limitations</Text>
      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={injuries}
        onChangeText={setInjuries}
        placeholder="e.g. Previous ACL tear, shoulder impingement..."
        placeholderTextColor={COLORS.secondary}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Current Maxes</Text>
      <Text style={styles.stepSubtitle}>
        Enter your current 1RM in lbs (optional)
      </Text>

      <Text style={styles.label}>Squat</Text>
      <TextInput
        style={styles.input}
        value={squat}
        onChangeText={setSquat}
        placeholder="lbs"
        placeholderTextColor={COLORS.secondary}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Bench Press</Text>
      <TextInput
        style={styles.input}
        value={bench}
        onChangeText={setBench}
        placeholder="lbs"
        placeholderTextColor={COLORS.secondary}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Deadlift</Text>
      <TextInput
        style={styles.input}
        value={deadlift}
        onChangeText={setDeadlift}
        placeholder="lbs"
        placeholderTextColor={COLORS.secondary}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Clean</Text>
      <TextInput
        style={styles.input}
        value={clean}
        onChangeText={setClean}
        placeholder="lbs"
        placeholderTextColor={COLORS.secondary}
        keyboardType="numeric"
      />
    </View>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Set Up Your Profile</Text>
        <Text style={styles.headerStep}>Step {step} of {TOTAL_STEPS}</Text>
        {renderStepDots()}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {renderCurrentStep()}
      </ScrollView>

      <View style={styles.footer}>
        {step > 1 ? (
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>BACK</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backPlaceholder} />
        )}

        {step < TOTAL_STEPS ? (
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>NEXT</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextButton, submitting && styles.buttonDisabled]}
            onPress={handleComplete}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.bg} size="small" />
            ) : (
              <Text style={styles.nextButtonText}>COMPLETE</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  headerStep: {
    fontSize: 14,
    color: COLORS.secondary,
    marginBottom: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.surface,
  },
  dotActive: {
    backgroundColor: COLORS.accent,
  },
  dotCompleted: {
    backgroundColor: COLORS.accent,
    opacity: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  stepContainer: {
    paddingTop: 8,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  stepSubtitle: {
    fontSize: 14,
    color: COLORS.secondary,
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  multilineInput: {
    minHeight: 120,
    paddingTop: 14,
  },
  selectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  selectorButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectorButtonFlex: {
    flex: 1,
    alignItems: 'center',
  },
  selectorButtonActive: {
    borderColor: COLORS.accent,
    backgroundColor: `${COLORS.accent}15`,
  },
  selectorText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  selectorTextActive: {
    color: COLORS.accent,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: COLORS.surface,
  },
  backButton: {
    borderWidth: 2,
    borderColor: COLORS.secondary,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  backButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  backPlaceholder: {
    width: 100,
  },
  nextButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 36,
    minWidth: 130,
    alignItems: 'center',
  },
  nextButtonText: {
    color: COLORS.bg,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
