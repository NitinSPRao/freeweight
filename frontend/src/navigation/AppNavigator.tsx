import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import AthleteHomeScreen from '../screens/athlete/HomeScreen';
import OnboardingScreen from '../screens/athlete/OnboardingScreen';
import CoachDashboardScreen from '../screens/coach/DashboardScreen';
import WorkoutScreen from '../screens/athlete/WorkoutScreen';
import ProgramBuilderScreen from '../screens/coach/ProgramBuilderScreen';
import AthleteDetailScreen from '../screens/coach/AthleteDetailScreen';

export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Onboarding: undefined;
  AthleteHome: undefined;
  CoachDashboard: undefined;
  Workout: { workoutId: number; workoutName: string };
  ProgramBuilder: undefined;
  AthleteDetail: { athleteId: number; athleteName: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#14181C' },
          animation: 'slide_from_right',
        }}
      >
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        ) : user.user_type === 'athlete' && !user.onboarding_completed ? (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="AthleteHome" component={AthleteHomeScreen} />
            <Stack.Screen name="Workout" component={WorkoutScreen} />
          </>
        ) : user.user_type === 'athlete' ? (
          <>
            <Stack.Screen name="AthleteHome" component={AthleteHomeScreen} />
            <Stack.Screen name="Workout" component={WorkoutScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="CoachDashboard" component={CoachDashboardScreen} />
            <Stack.Screen name="ProgramBuilder" component={ProgramBuilderScreen} />
            <Stack.Screen name="AthleteDetail" component={AthleteDetailScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
