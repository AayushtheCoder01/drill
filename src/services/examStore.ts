/* ============================================================================
 * examStore.ts — generated question sets: CRUD, persistence, and the
 * subscription React binds to. Same shape as journalStore.ts / chatStore.ts.
 * ========================================================================== */
import * as U from "@/lib/util";
import { idbAll, idbDelete, idbPut, STORE_EXAMS } from "./idb";
import * as persistence from "./persistence";
import type { Difficulty, Exam, ExamQuestion, ExamScope } from "@/types/exam";

let items: Exam[] = [];
let loaded = false;
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version++;
  listeners.forEach((l) => l());
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getVersion(): number {
  return version;
}
export function isLoaded(): boolean {
  return loaded;
}

export async function init(): Promise<void> {
  if (loaded) return;
  return reload();
}

export async function reload(): Promise<void> {
  try {
    items = await idbAll<Exam>(STORE_EXAMS);
  } catch (e) {
    console.error("could not load exams", e);
    items = [];
  }
  loaded = true;
  notify();
}

function persist(e: Exam): void {
  void persistence.guard("exam", idbPut(STORE_EXAMS, e));
  notify();
}

export function listForProject(projectId: string): Exam[] {
  return items.filter((e) => e.projectId === projectId).sort((a, b) => b.created - a.created);
}

export function get(id: string): Exam | undefined {
  return items.find((e) => e.id === id);
}

export function create(input: { projectId: string; title: string; scope: ExamScope; level: Difficulty; questions: ExamQuestion[] }): Exam {
  const e: Exam = {
    id: U.uuid(),
    projectId: input.projectId,
    title: input.title,
    created: Date.now(),
    scope: input.scope,
    level: input.level,
    questions: input.questions,
    finishedAt: null,
    rounds: 1
  };
  items.push(e);
  persist(e);
  return e;
}

/** "More questions" / "harder" — appends to the same exam rather than
 *  starting a new one, so scope and history stay in one place. */
export function addQuestions(exam: Exam, qs: ExamQuestion[]): void {
  exam.questions.push(...qs);
  exam.rounds += 1;
  exam.finishedAt = null;
  persist(exam);
}

export function recordAnswer(exam: Exam, questionId: string, answer: string, result: ExamQuestion["result"]): void {
  const q = exam.questions.find((x) => x.id === questionId);
  if (!q) return;
  q.answer = answer;
  q.result = result;
  q.answeredAt = Date.now();
  if (exam.questions.every((x) => x.result)) exam.finishedAt = Date.now();
  persist(exam);
}

export function remove(id: string): void {
  items = items.filter((e) => e.id !== id);
  void persistence.guard("exam", idbDelete(STORE_EXAMS, id));
  notify();
}
