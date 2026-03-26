import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface RPESliderProps {
  value: number | null;
  onChange: (val: number) => void;
}

const RPE_COLORS: Record<number, string> = {
  1: '#4CAF50',
  2: '#4CAF50',
  3: '#4CAF50',
  4: '#FFC107',
  5: '#FFC107',
  6: '#FFC107',
  7: '#FF9800',
  8: '#FF9800',
  9: '#F44336',
  10: '#F44336',
};

const RPESlider: React.FC<RPESliderProps> = ({ value, onChange }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>How hard was this session?</Text>
      <View style={styles.row}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rpe) => {
          const color = RPE_COLORS[rpe];
          const isSelected = value === rpe;
          return (
            <TouchableOpacity
              key={rpe}
              onPress={() => onChange(rpe)}
              style={[
                styles.circle,
                isSelected
                  ? { backgroundColor: color, borderColor: color }
                  : { backgroundColor: '#1C1C1E', borderColor: color },
              ]}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.circleText,
                  { color: isSelected ? '#FFFFFF' : color },
                ]}
              >
                {rpe}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.labelsRow}>
        <Text style={styles.label}>Easy</Text>
        <Text style={styles.label}>Max Effort</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  title: {
    fontSize: 16,
    color: '#E6EDF3',
    fontWeight: '600',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  label: {
    fontSize: 11,
    color: '#5A6572',
  },
});

export default RPESlider;
