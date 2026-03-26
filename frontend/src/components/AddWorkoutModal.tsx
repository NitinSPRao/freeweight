import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { athleteApi } from '../api/endpoints';

interface AddWorkoutModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string;
  onWorkoutCreated: () => void;
}

type Tab = 'create' | 'copy';

interface HistoryItem {
  id: number;
  workout_id: number;
  workout_name: string;
  scheduled_date: string;
  completed_at: string | null;
  is_completed: boolean;
  has_modifications: boolean;
  is_flagged: boolean;
  flag_reason: string | null;
  rpe: number | null;
}

const AddWorkoutModal: React.FC<AddWorkoutModalProps> = ({
  visible,
  onClose,
  selectedDate,
  onWorkoutCreated,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [copying, setCopying] = useState<number | null>(null);

  useEffect(() => {
    if (visible && activeTab === 'copy') {
      fetchHistory();
    }
  }, [visible, activeTab]);

  useEffect(() => {
    if (!visible) {
      setName('');
      setDescription('');
      setActiveTab('create');
      setHistory([]);
    }
  }, [visible]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await athleteApi.getHistory(10);
      setHistory(res.data);
    } catch {
      Alert.alert('Error', 'Failed to load recent workouts.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Missing name', 'Please enter a workout name.');
      return;
    }
    setCreating(true);
    try {
      await athleteApi.createWorkout({
        name: trimmed,
        description: description.trim() || undefined,
        scheduled_date: selectedDate,
      });
      onWorkoutCreated();
      onClose();
    } catch {
      Alert.alert('Error', 'Failed to create workout.');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (workoutId: number) => {
    setCopying(workoutId);
    try {
      await athleteApi.copyWorkout(workoutId, { scheduled_date: selectedDate });
      onWorkoutCreated();
      onClose();
    } catch {
      Alert.alert('Error', 'Failed to copy workout.');
    } finally {
      setCopying(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderHistoryItem = ({ item }: { item: HistoryItem }) => (
    <TouchableOpacity
      style={styles.historyCard}
      onPress={() => handleCopy(item.workout_id)}
      activeOpacity={0.7}
      disabled={copying !== null}
    >
      <View style={styles.historyCardContent}>
        <Text style={styles.historyName}>{item.workout_name}</Text>
        <Text style={styles.historyDate}>{formatDate(item.scheduled_date)}</Text>
      </View>
      {copying === item.workout_id && (
        <ActivityIndicator size="small" color="#C8FF00" />
      )}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          {/* Tabs */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'create' && styles.tabActive]}
              onPress={() => setActiveTab('create')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'create' && styles.tabTextActive,
                ]}
              >
                Create New
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'copy' && styles.tabActive]}
              onPress={() => setActiveTab('copy')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'copy' && styles.tabTextActive,
                ]}
              >
                Copy Previous
              </Text>
            </TouchableOpacity>
          </View>

          {/* Create New Tab */}
          {activeTab === 'create' && (
            <View style={styles.tabContent}>
              <TextInput
                style={styles.input}
                placeholder="Workout name"
                placeholderTextColor="#5A6572"
                value={name}
                onChangeText={setName}
                autoFocus
              />
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="Description (optional)"
                placeholderTextColor="#5A6572"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[styles.createButton, creating && styles.createButtonDisabled]}
                onPress={handleCreate}
                disabled={creating}
                activeOpacity={0.8}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#0A0A0A" />
                ) : (
                  <Text style={styles.createButtonText}>CREATE</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Copy Previous Tab */}
          {activeTab === 'copy' && (
            <View style={styles.tabContent}>
              {loadingHistory ? (
                <ActivityIndicator
                  size="large"
                  color="#C8FF00"
                  style={styles.loader}
                />
              ) : history.length === 0 ? (
                <Text style={styles.emptyText}>No recent workouts found.</Text>
              ) : (
                <FlatList
                  data={history}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={renderHistoryItem}
                  style={styles.list}
                  showsVerticalScrollIndicator={false}
                />
              )}
            </View>
          )}

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingBottom: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#C8FF00',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#5A6572',
  },
  tabTextActive: {
    color: '#E6EDF3',
  },
  tabContent: {
    minHeight: 180,
  },
  input: {
    backgroundColor: '#14181C',
    color: '#E6EDF3',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  multilineInput: {
    height: 80,
    paddingTop: 12,
  },
  createButton: {
    backgroundColor: '#C8FF00',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#0A0A0A',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  loader: {
    marginTop: 40,
  },
  emptyText: {
    color: '#5A6572',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  list: {
    maxHeight: 300,
  },
  historyCard: {
    backgroundColor: '#14181C',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyCardContent: {
    flex: 1,
  },
  historyName: {
    color: '#E6EDF3',
    fontSize: 15,
    fontWeight: '600',
  },
  historyDate: {
    color: '#5A6572',
    fontSize: 12,
    marginTop: 2,
  },
  cancelButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  cancelText: {
    color: '#888888',
    fontSize: 15,
  },
});

export default AddWorkoutModal;
