import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useAuth } from '../../hooks/useAuth';
import BottomTabBar, { Tab } from '../../components/BottomTabBar';
import { coachApi, programsApi, AthleteWithGroups, ProgramSummary } from '../../api/endpoints';

type Props = NativeStackScreenProps<RootStackParamList, 'CoachDashboard'>;

const TABS: Tab[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'roster', label: 'Roster' },
  { key: 'programs', label: 'Programs' },
];

const ACCENT = '#4df0c8';

// ─── Dashboard Tab ─────────────────────────────────────────────────────────────

const ONBOARDING_FIELDS: { key: string; label: string }[] = [
  { key: 'sport', label: 'Sport' },
  { key: 'team', label: 'Team' },
  { key: 'training_goals', label: 'Training Goals' },
  { key: 'injuries', label: 'Injuries' },
  { key: 'experience_level', label: 'Experience Level' },
  { key: 'maxes', label: 'Current Maxes' },
];

function DashboardTab({ onLogout }: { onLogout: () => Promise<void> }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['coachDashboard'],
    queryFn: () => coachApi.getDashboard().then((r) => r.data),
    refetchInterval: 60_000,
  });

  const { data: onboardingSettings } = useQuery({
    queryKey: ['coachOnboardingSettings'],
    queryFn: () => coachApi.getOnboardingSettings().then((r) => r.data),
  });

  const [skipFields, setSkipFields] = useState<string[]>([]);

  useEffect(() => {
    if (onboardingSettings?.skip_fields) {
      setSkipFields(onboardingSettings.skip_fields);
    }
  }, [onboardingSettings]);

  const updateSettingsMutation = useMutation({
    mutationFn: (skip_fields: string[]) => coachApi.updateOnboardingSettings(skip_fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coachOnboardingSettings'] });
      Alert.alert('Saved', 'Onboarding settings updated.');
    },
    onError: () => Alert.alert('Error', 'Failed to save settings.'),
  });

  const toggleField = (fieldKey: string) => {
    setSkipFields((prev) =>
      prev.includes(fieldKey)
        ? prev.filter((f) => f !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  const handleInvite = async () => {
    try {
      const res = await coachApi.getInviteLink();
      Alert.alert(
        'Invite Link',
        'Share this link with your athletes:\n\n' + res.data.invite_link
      );
    } catch {
      Alert.alert('Error', 'Could not generate invite link.');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{data?.completed_workouts_today ?? 0}</Text>
          <Text style={styles.statLabel}>Done Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, data?.flagged_athletes?.length ? { color: '#FF4D4F' } : {}]}>
            {data?.flagged_athletes?.length ?? 0}
          </Text>
          <Text style={styles.statLabel}>Flagged</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{data?.total_athletes ?? 0}</Text>
          <Text style={styles.statLabel}>Athletes</Text>
        </View>
      </View>

      {/* Flagged athletes */}
      {(data?.flagged_athletes?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>FLAGS & INJURIES</Text>
          {data!.flagged_athletes.map((athlete) => (
            <View key={athlete.id} style={styles.flagRow}>
              <Text style={styles.flagIcon}>⚑</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.flagName}>{athlete.name}</Text>
                <Text style={styles.flagReason}>{athlete.flag_reason}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Invite athletes */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ADD ATHLETES</Text>
        <TouchableOpacity style={[styles.outlineButton, { borderColor: ACCENT }]} onPress={handleInvite}>
          <Text style={[styles.outlineButtonText, { color: ACCENT }]}>
            COPY INVITE LINK
          </Text>
        </TouchableOpacity>
      </View>

      {/* Onboarding settings */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ONBOARDING SETTINGS</Text>
        <Text style={styles.onboardingHint}>
          Tap a field to skip it during athlete onboarding.
        </Text>
        <View style={styles.onboardingFieldsContainer}>
          {ONBOARDING_FIELDS.map((field) => {
            const isSkipped = skipFields.includes(field.key);
            return (
              <TouchableOpacity
                key={field.key}
                style={[
                  styles.onboardingFieldChip,
                  isSkipped && styles.onboardingFieldChipSkipped,
                ]}
                onPress={() => toggleField(field.key)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.onboardingFieldLabel,
                    isSkipped && styles.onboardingFieldLabelSkipped,
                  ]}
                >
                  {field.label}
                </Text>
                <Text style={[styles.onboardingFieldStatus, isSkipped ? { color: '#FF4D4F' } : { color: ACCENT }]}>
                  {isSkipped ? 'SKIP' : 'SHOW'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={[styles.primaryButton, { marginTop: 12, opacity: updateSettingsMutation.isPending ? 0.6 : 1 }]}
          onPress={() => updateSettingsMutation.mutate(skipFields)}
          disabled={updateSettingsMutation.isPending}
        >
          {updateSettingsMutation.isPending ? (
            <ActivityIndicator color="#14181C" size="small" />
          ) : (
            <Text style={[styles.primaryButtonText, { color: '#14181C' }]}>SAVE</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
        <Text style={styles.logoutText}>LOGOUT</Text>
      </TouchableOpacity>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ─── Roster Tab ────────────────────────────────────────────────────────────────

function RosterTab({ navigation }: { navigation: Props['navigation'] }) {
  const { data, isLoading } = useQuery({
    queryKey: ['coachRoster'],
    queryFn: () => coachApi.getRoster().then((r) => r.data.athletes),
    placeholderData: [],
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  const athletes: AthleteWithGroups[] = data ?? [];

  // Group athletes by their first group (or 'No Group')
  const grouped: Record<string, AthleteWithGroups[]> = {};
  athletes.forEach((a) => {
    const groupName = a.groups[0]?.name ?? 'No Group';
    if (!grouped[groupName]) grouped[groupName] = [];
    grouped[groupName].push(a);
  });

  if (athletes.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No athletes yet.</Text>
        <Text style={styles.emptySubtext}>
          Go to Dashboard → Copy Invite Link to add athletes.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {Object.entries(grouped).map(([groupName, groupAthletes]) => (
        <View key={groupName} style={styles.section}>
          <Text style={styles.sectionLabel}>{groupName.toUpperCase()}</Text>
          {groupAthletes.map((athlete) => (
            <TouchableOpacity
              key={athlete.id}
              style={styles.athleteRow}
              onPress={() =>
                navigation.navigate('AthleteDetail', {
                  athleteId: athlete.id,
                  athleteName: athlete.name,
                })
              }
            >
              <View style={styles.athleteAvatar}>
                <Text style={styles.athleteAvatarText}>
                  {athlete.name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.athleteName}>{athlete.name}</Text>
                <Text style={styles.athleteMeta}>
                  {[athlete.sport, athlete.subgroups[0]?.name].filter(Boolean).join(' · ') ||
                    athlete.email}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ─── Programs Tab ──────────────────────────────────────────────────────────────

function ProgramsTab({ navigation }: { navigation: Props['navigation'] }) {
  const { data: programs = [], isLoading } = useQuery({
    queryKey: ['programs'],
    queryFn: () => programsApi.list().then((r) => r.data),
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <TouchableOpacity
        style={[styles.primaryButton, { borderColor: ACCENT, marginBottom: 24 }]}
        onPress={() => navigation.navigate('ProgramBuilder')}
      >
        <Text style={[styles.primaryButtonText, { color: '#14181C' }]}>
          + CREATE PROGRAM
        </Text>
      </TouchableOpacity>

      {programs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No programs yet.</Text>
          <Text style={styles.emptySubtext}>Create your first program above.</Text>
        </View>
      ) : (
        programs.map((program: ProgramSummary) => (
          <View key={program.id} style={styles.programCard}>
            <Text style={styles.programName}>{program.name}</Text>
            {program.description ? (
              <Text style={styles.programDesc} numberOfLines={2}>
                {program.description}
              </Text>
            ) : null}
            <Text style={styles.programMeta}>
              {program.workout_count} session{program.workout_count !== 1 ? 's' : ''} ·{' '}
              Created{' '}
              {new Date(program.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
        ))
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CoachDashboardScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  const firstName = user?.name.split(' ')[0] ?? 'Coach';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: '#1a2533' }]}>
        <Text style={[styles.headerBrand, { color: ACCENT }]}>FREEWEIGHT</Text>
        <Text style={styles.headerGreeting}>Hi, {firstName}</Text>
      </View>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'dashboard' && <DashboardTab onLogout={logout} />}
        {activeTab === 'roster' && <RosterTab navigation={navigation} />}
        {activeTab === 'programs' && <ProgramsTab navigation={navigation} />}
      </View>

      <BottomTabBar
        tabs={TABS}
        activeTab={activeTab}
        onTabPress={setActiveTab}
        accentColor={ACCENT}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#14181C',
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  headerBrand: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  headerGreeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#E6EDF3',
    marginTop: 4,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5A6572',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#E6EDF3',
  },
  statLabel: {
    fontSize: 11,
    color: '#5A6572',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  flagRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(255,77,79,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,79,0.2)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  flagIcon: {
    fontSize: 16,
    color: '#FF4D4F',
  },
  flagName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E6EDF3',
    marginBottom: 2,
  },
  flagReason: {
    fontSize: 13,
    color: '#5A6572',
  },
  outlineButton: {
    borderWidth: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  outlineButtonText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  logoutButton: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#2D3748',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  logoutText: {
    color: '#E6EDF3',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#E6EDF3',
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#5A6572',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  athleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  athleteAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(77,240,200,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  athleteAvatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: ACCENT,
  },
  athleteName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E6EDF3',
    marginBottom: 2,
  },
  athleteMeta: {
    fontSize: 12,
    color: '#5A6572',
  },
  chevron: {
    fontSize: 20,
    color: '#5A6572',
  },
  primaryButton: {
    backgroundColor: ACCENT,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  programCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: ACCENT,
  },
  programName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#E6EDF3',
    marginBottom: 4,
  },
  programDesc: {
    fontSize: 13,
    color: '#5A6572',
    marginBottom: 8,
    lineHeight: 20,
  },
  programMeta: {
    fontSize: 11,
    color: '#5A6572',
    fontWeight: '600',
  },
  onboardingHint: {
    fontSize: 12,
    color: '#5A6572',
    marginBottom: 12,
    lineHeight: 18,
  },
  onboardingFieldsContainer: {
    gap: 8,
  },
  onboardingFieldChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1F2937',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(77,240,200,0.15)',
  },
  onboardingFieldChipSkipped: {
    borderColor: 'rgba(255,77,79,0.2)',
    backgroundColor: 'rgba(255,77,79,0.05)',
  },
  onboardingFieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E6EDF3',
  },
  onboardingFieldLabelSkipped: {
    textDecorationLine: 'line-through',
    color: '#5A6572',
  },
  onboardingFieldStatus: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
