"use client";

import { useEffect, useState } from "react";

interface RestTimerProps {
  durationSeconds: number;
  nextSetInfo?: string;
  onComplete: () => void;
  onSkip: () => void;
}

export default function RestTimer({
  durationSeconds,
  nextSetInfo,
  onComplete,
  onSkip,
}: RestTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(durationSeconds);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    if (!isRunning || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          // Play sound/vibration if available
          if (typeof window !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate(200);
          }
          // Call onComplete after a brief delay to show 0:00
          setTimeout(onComplete, 500);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, timeRemaining, onComplete]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const addTime = () => {
    setTimeRemaining((prev) => prev + 15);
  };

  const reduceTime = () => {
    setTimeRemaining((prev) => Math.max(0, prev - 15));
  };

  const progress = ((durationSeconds - timeRemaining) / durationSeconds) * 100;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onSkip();
      }}
    >
      <div
        className="bg-[#1F2937] rounded-xl p-8 max-w-sm w-full text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-heading font-bold text-text mb-6">REST</h2>

        {/* Circular Progress Timer */}
        <div className="relative w-48 h-48 mx-auto mb-6">
          <svg className="transform -rotate-90 w-48 h-48">
            {/* Background circle */}
            <circle
              cx="96"
              cy="96"
              r="88"
              stroke="rgba(230, 237, 243, 0.1)"
              strokeWidth="8"
              fill="none"
            />
            {/* Progress circle */}
            <circle
              cx="96"
              cy="96"
              r="88"
              stroke="#B4F000"
              strokeWidth="8"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 88}`}
              strokeDashoffset={`${2 * Math.PI * 88 * (1 - progress / 100)}`}
              strokeLinecap="round"
              className="transition-all duration-300"
            />
          </svg>

          {/* Timer Text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-6xl font-heading font-bold text-primary">
              {formatTime(timeRemaining)}
            </div>
          </div>
        </div>

        {/* Next Set Info */}
        {nextSetInfo && (
          <div className="mb-6">
            <p className="text-secondary text-sm mb-1">Next:</p>
            <p className="text-text font-medium">{nextSetInfo}</p>
          </div>
        )}

        {/* Time Adjust Buttons */}
        <div className="flex gap-3 mb-6 justify-center">
          <button
            onClick={reduceTime}
            className="px-4 py-2 bg-background border border-secondary/30 text-text rounded-lg hover:border-secondary transition-colors"
          >
            -15s
          </button>
          <button
            onClick={addTime}
            className="px-4 py-2 bg-background border border-secondary/30 text-text rounded-lg hover:border-secondary transition-colors"
          >
            +15s
          </button>
        </div>

        {/* Skip Button */}
        <button
          onClick={onSkip}
          className="w-full btn-secondary"
        >
          Skip Rest
        </button>
      </div>
    </div>
  );
}
