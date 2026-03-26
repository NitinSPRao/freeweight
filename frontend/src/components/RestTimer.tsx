import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
} from 'react-native';

interface RestTimerProps {
  visible: boolean;
  onDismiss: () => void;
  defaultDuration?: number;
}

const PRESETS = [
  { label: '30s', seconds: 30 },
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
  { label: '2:00', seconds: 120 },
  { label: '3:00', seconds: 180 },
  { label: '5:00', seconds: 300 },
];

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const RestTimer: React.FC<RestTimerProps> = ({
  visible,
  onDismiss,
  defaultDuration = 90,
}) => {
  const [timeRemaining, setTimeRemaining] = useState(defaultDuration);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(defaultDuration);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
  }, []);

  // Auto-start when visible becomes true
  useEffect(() => {
    if (visible) {
      setTimeRemaining(selectedPreset);
      setIsRunning(true);
    } else {
      clearTimers();
      setIsRunning(false);
    }
  }, [visible, clearTimers, selectedPreset]);

  // Countdown interval
  useEffect(() => {
    if (isRunning && timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, timeRemaining]);

  // Handle timer reaching zero
  useEffect(() => {
    if (timeRemaining === 0 && isRunning) {
      setIsRunning(false);
      Vibration.vibrate(500);
      dismissTimeoutRef.current = setTimeout(() => {
        onDismiss();
      }, 1000);
    }
  }, [timeRemaining, isRunning, onDismiss]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const handlePresetSelect = (seconds: number) => {
    setSelectedPreset(seconds);
    setTimeRemaining(seconds);
    setIsRunning(true);
  };

  const handleToggleRunning = () => {
    setIsRunning((prev) => !prev);
  };

  const handleSkip = () => {
    clearTimers();
    setIsRunning(false);
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Text style={styles.heading}>Rest Timer</Text>

        <View style={styles.timerCircle}>
          <Text style={styles.timerText}>{formatTime(timeRemaining)}</Text>
        </View>

        <View style={styles.presetsRow}>
          {PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.seconds}
              style={[
                styles.presetChip,
                selectedPreset === preset.seconds && styles.presetChipActive,
              ]}
              onPress={() => handlePresetSelect(preset.seconds)}
            >
              <Text
                style={[
                  styles.presetChipText,
                  selectedPreset === preset.seconds &&
                    styles.presetChipTextActive,
                ]}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.toggleButton}
          onPress={handleToggleRunning}
        >
          <Text style={styles.toggleButtonText}>
            {isRunning ? 'PAUSE' : 'START'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipButtonText}>SKIP</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 32,
  },
  timerCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderColor: '#C8FF00',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  timerText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 40,
  },
  presetChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  presetChipActive: {
    borderColor: '#C8FF00',
  },
  presetChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#AAAAAA',
  },
  presetChipTextActive: {
    color: '#C8FF00',
  },
  toggleButton: {
    backgroundColor: '#C8FF00',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 28,
    marginBottom: 20,
  },
  toggleButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    letterSpacing: 1,
  },
  skipButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
    letterSpacing: 1,
  },
});

export default RestTimer;
