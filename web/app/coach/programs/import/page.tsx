"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import { programApi, ParsedProgram } from "@/lib/api-endpoints";
import { getAuthData } from "@/lib/auth";

const FEEDBACK_OPTIONS = [
  "Section headers mistaken for exercises",
  "Exercises are missing or incomplete",
  "Sets or reps were misread",
  "Loads or weights are wrong or missing",
  "Exercise assigned to wrong day or week",
  "Workout days not separated correctly",
  "Coach notes or comments were lost",
];

type PageState = "upload" | "preview" | "saving" | "error";

function Spinner() {
  return (
    <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
  );
}

export default function ImportProgramPage() {
  const { user } = getAuthData();
  const router = useRouter();

  // Keep the original File for the entire session so it can be re-sent on retry
  const fileRef = useRef<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");

  const [pageState, setPageState] = useState<PageState>("upload");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [parsedResult, setParsedResult] = useState<ParsedProgram | null>(null);
  const [programName, setProgramName] = useState("");
  const [programDesc, setProgramDesc] = useState("");

  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackIssues, setFeedbackIssues] = useState<string[]>([]);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

  // Track which workout cards are collapsed (empty = all expanded)
  const [collapsedWorkouts, setCollapsedWorkouts] = useState<Set<number>>(
    new Set()
  );

  const toggleFeedbackIssue = (label: string) => {
    setFeedbackIssues((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const toggleWorkout = (idx: number) => {
    setCollapsedWorkouts((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      fileRef.current = file;
      setSelectedFileName(file.name);
    }
  };

  const handleParse = async () => {
    if (!fileRef.current) return;
    setIsLoading(true);
    setLoadingMsg("Analyzing your spreadsheet...");
    try {
      const formData = new FormData();
      formData.append("file", fileRef.current);
      const result = await programApi.parseProgram(formData);
      setParsedResult(result);
      setProgramName(result.program_name);
      setProgramDesc(result.description || "");
      setCollapsedWorkouts(new Set());
      setPageState("preview");
      setShowFeedback(false);
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.detail ||
          "Failed to parse spreadsheet. Please try again."
      );
      setPageState("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReparse = async () => {
    const file = fileRef.current;
    const current = parsedResult;
    if (!file || !current) return;
    setIsLoading(true);
    setFeedbackError("");
    setLoadingMsg("Re-analyzing with your feedback...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("feedback_issues", feedbackIssues.join(", "));
      if (feedbackText) formData.append("feedback_text", feedbackText);
      formData.append("previous_result", JSON.stringify(current));
      const result = await programApi.parseProgram(formData);
      setParsedResult(result);
      setProgramName(result.program_name);
      setProgramDesc(result.description || "");
      setCollapsedWorkouts(new Set());
      setShowFeedback(false);
      setFeedbackIssues([]);
      setFeedbackText("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setFeedbackError(
        err?.response?.data?.detail || "Re-parse failed. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    const current = parsedResult;
    if (!current) return;
    setPageState("saving");
    try {
      await programApi.importProgram({
        ...current,
        program_name: programName,
        description: programDesc || null,
      });
      router.push("/coach/programs");
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.detail ||
          "Failed to save program. Please try again."
      );
      setPageState("preview");
    }
  };

  const exerciseCount =
    parsedResult?.workouts.reduce((acc, w) => acc + w.exercises.length, 0) ??
    0;

  // ── Saving state ─────────────────────────────────────────────────────────────

  if (pageState === "saving") {
    return (
      <AuthGuard requiredUserType="coach">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Spinner />
            <p className="text-text font-medium text-lg">
              Saving your program...
            </p>
          </div>
        </div>
      </AuthGuard>
    );
  }

  // ── Parsing loading overlay ───────────────────────────────────────────────────

  if (isLoading && pageState === "upload") {
    return (
      <AuthGuard requiredUserType="coach">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Spinner />
            <p className="text-text font-medium text-lg">{loadingMsg}</p>
            <p className="text-secondary text-sm mt-2">
              This may take a few seconds
            </p>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard requiredUserType="coach">
      <div className="min-h-screen bg-background">
        <NavBar
          userName={user?.name || ""}
          userType="coach"
          profilePhoto={user?.profile_photo_url}
        />

        {/* Extra bottom padding so content clears the sticky action bar */}
        <main className="max-w-3xl mx-auto px-4 py-8 pb-28">
          <div className="mb-6">
            <Link
              href="/coach/programs"
              className="text-secondary hover:text-text text-sm inline-flex items-center gap-1"
            >
              ← Back to Programs
            </Link>
          </div>

          {/* ── ERROR STATE ─────────────────────────────────────────────────── */}
          {pageState === "error" && (
            <div className="card text-center py-12">
              <h2 className="text-xl font-heading font-bold text-text mb-3">
                Something went wrong
              </h2>
              <p className="text-secondary mb-6">{errorMsg}</p>
              <button
                onClick={() => {
                  setPageState("upload");
                  setErrorMsg("");
                }}
                className="btn-primary"
              >
                Try Again
              </button>
            </div>
          )}

          {/* ── UPLOAD STATE ─────────────────────────────────────────────────── */}
          {pageState === "upload" && (
            <div className="card">
              <h1 className="text-3xl font-heading font-bold text-text mb-2">
                Import Program from Spreadsheet
              </h1>
              <p className="text-secondary mb-8">
                Upload an Excel file and AI will automatically structure it into
                a training program.
              </p>

              <label
                htmlFor="file-input"
                className={`block w-full border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  selectedFileName
                    ? "border-primary/60 bg-primary/5"
                    : "border-secondary/30 hover:border-primary/40 hover:bg-primary/5"
                }`}
              >
                <div className="text-4xl mb-3">📊</div>
                {selectedFileName ? (
                  <>
                    <p className="text-text font-medium">{selectedFileName}</p>
                    <p className="text-secondary text-sm mt-1">
                      Click to change file
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-text font-medium">
                      Click to choose a file
                    </p>
                    <p className="text-secondary text-sm mt-1">
                      Accepts .xlsx files only
                    </p>
                  </>
                )}
              </label>
              <input
                id="file-input"
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleFileChange}
              />

              <div className="mt-6">
                <button
                  onClick={handleParse}
                  disabled={!selectedFileName}
                  className="btn-primary w-full"
                >
                  Parse Program
                </button>
              </div>
            </div>
          )}

          {/* ── PREVIEW STATE ─────────────────────────────────────────────────── */}
          {pageState === "preview" && parsedResult && (
            <div className="space-y-6">
              {/* Inline error from failed save */}
              {errorMsg && (
                <div className="p-4 rounded-lg bg-error/10 border border-error/40 text-error text-sm">
                  {errorMsg}
                </div>
              )}

              {/* Program details (editable) */}
              <div className="card">
                <h1 className="text-2xl font-heading font-bold text-text mb-1">
                  Review Parsed Program
                </h1>
                <p className="text-secondary text-sm mb-6">
                  {parsedResult.workouts.length} workout
                  {parsedResult.workouts.length !== 1 ? "s" : ""} &middot;{" "}
                  {exerciseCount} exercise{exerciseCount !== 1 ? "s" : ""} total
                </p>

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-text mb-2">
                      Program Name
                    </label>
                    <input
                      type="text"
                      value={programName}
                      onChange={(e) => setProgramName(e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text mb-2">
                      Description
                    </label>
                    <textarea
                      value={programDesc}
                      onChange={(e) => setProgramDesc(e.target.value)}
                      className="input-field min-h-[80px]"
                    />
                  </div>
                </div>
              </div>

              {/* Workout cards */}
              {parsedResult.workouts.map((workout, wi) => (
                <div key={wi} className="card">
                  <button
                    onClick={() => toggleWorkout(wi)}
                    className="w-full flex justify-between items-start text-left"
                  >
                    <div>
                      <h3 className="text-lg font-heading font-bold text-text">
                        {workout.name}
                      </h3>
                      {workout.description && (
                        <p className="text-secondary text-sm mt-0.5">
                          {workout.description}
                        </p>
                      )}
                    </div>
                    <span className="text-secondary text-xs ml-4 mt-1 flex-shrink-0">
                      {collapsedWorkouts.has(wi) ? "▼ Show" : "▲ Hide"}
                    </span>
                  </button>

                  {!collapsedWorkouts.has(wi) && (
                    <div className="mt-4">
                      {workout.exercises.length === 0 ? (
                        <p className="text-secondary text-sm italic">
                          No exercises parsed for this session.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-secondary/20">
                                <th className="text-left text-secondary font-medium pb-2 pr-3">
                                  Exercise
                                </th>
                                <th className="text-center text-secondary font-medium pb-2 px-2 w-14">
                                  Sets
                                </th>
                                <th className="text-center text-secondary font-medium pb-2 px-2 w-14">
                                  Reps
                                </th>
                                <th className="text-left text-secondary font-medium pb-2 pl-3">
                                  Notes
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {workout.exercises.map((ex, ei) => (
                                <tr
                                  key={ei}
                                  className="border-b border-secondary/10 last:border-0"
                                >
                                  <td className="py-2 pr-3 text-text font-medium">
                                    {ex.name}
                                  </td>
                                  <td className="py-2 px-2 text-center text-secondary">
                                    {ex.sets}
                                  </td>
                                  <td className="py-2 px-2 text-center text-secondary">
                                    {ex.reps}
                                  </td>
                                  <td className="py-2 pl-3 text-secondary text-xs">
                                    {ex.coach_notes || "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Feedback panel — overlays preview, does not replace it */}
              {showFeedback && (
                <div className="card border-2 border-amber-400/50">
                  <h3 className="text-lg font-heading font-bold text-text mb-1">
                    What needs to be fixed?
                  </h3>
                  <p className="text-secondary text-sm mb-4">
                    Select all that apply — the AI will re-parse your
                    spreadsheet with these corrections in mind.
                  </p>

                  <div className="space-y-2 mb-4">
                    {FEEDBACK_OPTIONS.map((option) => (
                      <label
                        key={option}
                        className="flex items-center gap-3 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={feedbackIssues.includes(option)}
                          onChange={() => toggleFeedbackIssue(option)}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-text text-sm">{option}</span>
                      </label>
                    ))}
                  </div>

                  <div className="mb-4">
                    <textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      className="input-field"
                      placeholder="Any additional details to help the AI? (optional)"
                      rows={3}
                    />
                  </div>

                  {feedbackError && (
                    <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/40 text-error text-sm">
                      {feedbackError}
                    </div>
                  )}

                  <button
                    onClick={handleReparse}
                    disabled={feedbackIssues.length === 0 || isLoading}
                    className="btn-primary w-full"
                  >
                    {isLoading ? "Re-analyzing with your feedback..." : "Re-parse"}
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Sticky bottom action bar — only in preview state */}
        {pageState === "preview" && parsedResult && (
          <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-secondary/20 px-4 py-4 z-10">
            <div className="max-w-3xl mx-auto flex justify-between items-center gap-3">
              <button
                onClick={() => {
                  setShowFeedback((prev) => !prev);
                  setFeedbackError("");
                }}
                className="px-4 py-2 rounded-lg border border-amber-500 text-amber-600 hover:bg-amber-500/10 text-sm font-medium transition-colors"
              >
                {showFeedback ? "Hide Feedback" : "Something's Wrong"}
              </button>
              <button
                onClick={handleSave}
                disabled={!programName.trim() || isLoading}
                className="btn-primary"
              >
                Save Program
              </button>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
