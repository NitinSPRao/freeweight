import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SectionList,
} from 'react-native';
import { exerciseApi, ExerciseCatalogItem } from '../api/endpoints';

interface ExercisePickerProps {
  onSelect: (name: string) => void;
  selectedValue?: string;
  placeholder?: string;
  accentColor?: string;
}

interface GroupedSection {
  title: string;
  data: ExerciseCatalogItem[];
}

const ExercisePicker: React.FC<ExercisePickerProps> = ({
  onSelect,
  selectedValue,
  placeholder = 'Select exercise...',
  accentColor = '#B4F000',
}) => {
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ExerciseCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [creatingCustom, setCreatingCustom] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!showModal) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchExercises(search);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [search, showModal]);

  const fetchExercises = async (query: string) => {
    setLoading(true);
    try {
      const params: { search?: string } = {};
      if (query.trim()) {
        params.search = query.trim();
      }
      const response = await exerciseApi.list(params);
      setResults(response.data);
    } catch (error) {
      console.error('Failed to fetch exercises:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const groupByCategory = (items: ExerciseCatalogItem[]): GroupedSection[] => {
    const groups: Record<string, ExerciseCatalogItem[]> = {};

    items.forEach((item) => {
      const category = item.category || 'Uncategorized';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(item);
    });

    return Object.keys(groups)
      .sort()
      .map((key) => ({
        title: key,
        data: groups[key],
      }));
  };

  const handleSelect = (name: string) => {
    onSelect(name);
    closeModal();
  };

  const handleCreateCustom = async () => {
    const trimmed = customName.trim();
    if (!trimmed) return;

    setCreatingCustom(true);
    try {
      const response = await exerciseApi.create({ name: trimmed });
      onSelect(response.data.name);
      closeModal();
    } catch (error) {
      console.error('Failed to create custom exercise:', error);
    } finally {
      setCreatingCustom(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSearch('');
    setResults([]);
    setShowAddCustom(false);
    setCustomName('');
  };

  const sections = groupByCategory(results);

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.triggerText,
            !selectedValue && styles.triggerPlaceholder,
          ]}
          numberOfLines={1}
        >
          {selectedValue || placeholder}
        </Text>
        <Text style={styles.triggerChevron}>▾</Text>
      </TouchableOpacity>

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Select Exercise</Text>
            <TouchableOpacity onPress={closeModal} activeOpacity={0.7}>
              <Text style={[styles.headerClose, { color: accentColor }]}>
                Done
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search exercises..."
              placeholderTextColor="#5A6572"
              value={search}
              onChangeText={setSearch}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>

          {/* Results */}
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={accentColor} />
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id.toString()}
              renderSectionHeader={({ section: { title } }) => (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderText}>
                    {title.toUpperCase()}
                  </Text>
                </View>
              )}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultItem}
                  onPress={() => handleSelect(item.name)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.resultName}>{item.name}</Text>
                  {item.muscle_group && (
                    <Text style={styles.resultMeta}>{item.muscle_group}</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                !loading ? (
                  <View style={styles.centered}>
                    <Text style={styles.emptyText}>
                      {search.trim()
                        ? 'No exercises found'
                        : 'Start typing to search'}
                    </Text>
                  </View>
                ) : null
              }
              ListFooterComponent={
                <View style={styles.footer}>
                  {!showAddCustom ? (
                    <TouchableOpacity
                      style={[
                        styles.addCustomButton,
                        { borderColor: accentColor },
                      ]}
                      onPress={() => {
                        setShowAddCustom(true);
                        setCustomName(search.trim());
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.addCustomButtonText,
                          { color: accentColor },
                        ]}
                      >
                        + Add Custom
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.addCustomForm}>
                      <Text style={styles.addCustomLabel}>
                        CUSTOM EXERCISE NAME
                      </Text>
                      <TextInput
                        style={styles.addCustomInput}
                        placeholder="e.g. Barbell Hip Thrust"
                        placeholderTextColor="#5A6572"
                        value={customName}
                        onChangeText={setCustomName}
                        autoFocus
                        autoCapitalize="words"
                        returnKeyType="done"
                        onSubmitEditing={handleCreateCustom}
                      />
                      <View style={styles.addCustomActions}>
                        <TouchableOpacity
                          style={styles.addCustomCancel}
                          onPress={() => {
                            setShowAddCustom(false);
                            setCustomName('');
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.addCustomCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.addCustomSubmit,
                            { backgroundColor: accentColor },
                            (!customName.trim() || creatingCustom) &&
                              styles.addCustomSubmitDisabled,
                          ]}
                          onPress={handleCreateCustom}
                          disabled={!customName.trim() || creatingCustom}
                          activeOpacity={0.7}
                        >
                          {creatingCustom ? (
                            <ActivityIndicator size="small" color="#14181C" />
                          ) : (
                            <Text style={styles.addCustomSubmitText}>
                              Create
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              }
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled
            />
          )}
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  // Trigger button
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  triggerText: {
    flex: 1,
    color: '#E6EDF3',
    fontSize: 15,
  },
  triggerPlaceholder: {
    color: '#5A6572',
  },
  triggerChevron: {
    color: '#5A6572',
    fontSize: 14,
    marginLeft: 8,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#14181C',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    color: '#E6EDF3',
    fontSize: 18,
    fontWeight: '700',
  },
  headerClose: {
    fontSize: 16,
    fontWeight: '600',
  },

  // Search
  searchContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchInput: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#E6EDF3',
    fontSize: 15,
  },

  // List
  listContent: {
    paddingBottom: 40,
  },

  // Section headers
  sectionHeader: {
    backgroundColor: '#14181C',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sectionHeaderText: {
    color: '#5A6572',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // Result items
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1F2937',
    marginHorizontal: 20,
    marginBottom: 2,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
  },
  resultName: {
    color: '#E6EDF3',
    fontSize: 15,
    flex: 1,
  },
  resultMeta: {
    color: '#5A6572',
    fontSize: 13,
    marginLeft: 8,
  },

  // Empty state
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#5A6572',
    fontSize: 15,
  },

  // Footer / Add Custom
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  addCustomButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addCustomButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Add custom form
  addCustomForm: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
  },
  addCustomLabel: {
    color: '#5A6572',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  addCustomInput: {
    backgroundColor: '#14181C',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#E6EDF3',
    fontSize: 15,
    marginBottom: 12,
  },
  addCustomActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  addCustomCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  addCustomCancelText: {
    color: '#5A6572',
    fontSize: 14,
    fontWeight: '600',
  },
  addCustomSubmit: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  addCustomSubmitText: {
    color: '#14181C',
    fontSize: 14,
    fontWeight: '700',
  },
  addCustomSubmitDisabled: {
    opacity: 0.4,
  },
});

export default ExercisePicker;
