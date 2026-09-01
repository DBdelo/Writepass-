"use client";

import { PDFDocument } from "pdf-lib";
import html2canvas from "html2canvas";
import {
  BookOpenCheck,
  Download,
  Eye,
  FileDown,
  FileText,
  Layers2,
  Loader2,
  Printer,
} from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { countAnswerWords, getModelAnswer } from "./model-answers";
import writingProblems from "../public/data/writing-problems.json";

type WordCount = {
  min: number;
  max: number;
};

type WritingProblem = {
  id: string;
  grade: "3級" | "準2級" | "2級" | "準1級";
  year: number;
  session: number;
  questionNumber: number;
  type: "英作文" | "Eメール" | "英文要約";
  wordCount?: WordCount | null;
  requiredAnswers?: number | null;
  requiredReasons?: number | null;
  requiredQuestionsAboutUnderlinedText?: number | null;
  requiredPointsToUse?: number | null;
  requiredStructure?: string[] | null;
  pointsAreReferenceOnly?: boolean | null;
  question?: string | null;
  topic?: string | null;
  points?: string[] | null;
  email?: string | null;
  underlinedQuestions?: string[] | null;
  underlinedText?: string | null;
  questionToAnswer?: string | null;
  sourceText?: string | null;
};

type SheetKind = "problem" | "answer" | "model";

type PdfState = Partial<Record<SheetKind, string>>;

const writingProblemData = writingProblems as unknown as WritingProblem[];

const gradeOrder = ["3級", "準2級", "2級", "準1級"] as const;
const sheetLabels: Record<SheetKind, string> = {
  problem: "問題用紙",
  answer: "解答用紙",
  model: "模範解答",
};

const gradeDisplay: Record<WritingProblem["grade"], string> = {
  "3級": "Grade 3",
  "準2級": "Grade Pre-2",
  "2級": "Grade 2",
  "準1級": "Grade Pre-1",
};

const gradeSlug: Record<WritingProblem["grade"], string> = {
  "3級": "grade3",
  "準2級": "grade-pre2",
  "2級": "grade2",
  "準1級": "grade-pre1",
};

function sortProblems(a: WritingProblem, b: WritingProblem) {
  const gradeDelta = gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade);
  if (gradeDelta !== 0) return gradeDelta;
  if (a.year !== b.year) return a.year - b.year;
  if (a.session !== b.session) return a.session - b.session;
  return a.questionNumber - b.questionNumber;
}

function latestProblemFor(
  problems: WritingProblem[],
  grade?: WritingProblem["grade"],
  year?: number,
  session?: number,
) {
  const filtered = problems
    .filter((problem) => !grade || problem.grade === grade)
    .filter((problem) => !year || problem.year === year)
    .filter((problem) => !session || problem.session === session)
    .toSorted((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.session !== b.session) return b.session - a.session;
      return b.questionNumber - a.questionNumber;
    });

  return filtered[0];
}

function uniqueSorted<T extends string | number>(values: T[], descending = false) {
  const unique = Array.from(new Set(values));
  return unique.sort((a, b) => {
    if (typeof a === "number" && typeof b === "number") {
      return descending ? b - a : a - b;
    }
    return descending
      ? String(b).localeCompare(String(a), "ja")
      : String(a).localeCompare(String(b), "ja");
  });
}

function wordRange(problem: WritingProblem) {
  if (!problem.wordCount) return "";
  return `${problem.wordCount.min}語〜${problem.wordCount.max}語`;
}

function problemTitle(problem: WritingProblem) {
  if (problem.type === "英作文" && (problem.topic || problem.question)) {
    return problem.topic ? "TOPIC" : "QUESTION";
  }
  if (problem.type === "英文要約") return "英文";
  return "Eメール";
}

function getInstructions(problem: WritingProblem) {
  const range = wordRange(problem);

  if (problem.type === "英文要約") {
    return [
      "以下の英文を読み、その内容を英語で要約しなさい。",
      range ? `語数の目安は${range}です。` : "",
      "解答は、解答用紙のライティング解答欄に書きなさい。なお、解答欄の外に書かれたものは採点されません。",
      "英文の内容からずれていると判断された場合は、0点と採点されることがあります。内容をよく読んでから答えてください。",
    ].filter(Boolean);
  }

  if (problem.type === "Eメール") {
    if (problem.grade === "準2級") {
      return [
        "あなたは、外国人の友達から以下の Eメール を受け取りました。",
        `下線部について、あなたがより詳しく知りたいことを${problem.requiredQuestionsAboutUnderlinedText ?? 2}つ質問しなさい。`,
        "Eメールの最後の質問に対するあなたの考えと、その理由を2つ書きなさい。",
        range ? `語数の目安は${range}です。` : "",
        "解答は、解答用紙のライティング解答欄に書きなさい。なお、解答欄の外に書かれたものは採点されません。",
      ].filter(Boolean);
    }

    return [
      "あなたは、外国人の友達から以下の Eメール を受け取りました。",
      `Eメールへの返事を、相手の質問に対応する答えを含めて英文で書きなさい。答えは${problem.requiredAnswers ?? 2}つ書きなさい。`,
      range ? `語数の目安は${range}です。` : "",
      "解答は、解答用紙のライティング解答欄に書きなさい。なお、解答欄の外に書かれたものは採点されません。",
    ].filter(Boolean);
  }

  if (problem.grade === "3級") {
    return [
      "あなたは、外国人の友達から以下の QUESTION をされました。",
      `QUESTION について、あなたの考えとその理由を${problem.requiredReasons ?? 2}つ英文で書きなさい。`,
      range ? `語数の目安は${range}です。` : "",
      "解答は、解答用紙のライティング解答欄に書きなさい。なお、解答欄の外に書かれたものは採点されません。",
    ].filter(Boolean);
  }

  const pointInstruction = problem.requiredPointsToUse
    ? `POINTS の中から${problem.requiredPointsToUse}つを使い、あなたの意見とその理由を書きなさい。`
    : "POINTS は理由を書く際の参考となる観点を示したものです。ただし、これら以外の観点から理由を書いてもかまいません。";

  return [
    `以下の TOPIC について、あなたの意見とその理由を${problem.requiredReasons ?? 2}つ書きなさい。`,
    problem.points?.length ? pointInstruction : "",
    range ? `語数の目安は${range}です。` : "",
    "解答は、解答用紙の B 面にあるライティング解答欄に書きなさい。なお、解答欄の外に書かれたものは採点されません。",
    "解答が TOPIC に示された問いの答えになっていない場合や、TOPIC からずれていると判断された場合は、0点と採点されることがあります。TOPIC の内容をよく読んでから答えてください。",
  ].filter(Boolean);
}

function splitWithHighlights(text: string, highlights: string[]) {
  if (!highlights.length) return [{ text, highlighted: false }];

  const escaped = highlights
    .filter(Boolean)
    .toSorted((a, b) => b.length - a.length)
    .map((highlight) => highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (!escaped.length) return [{ text, highlighted: false }];

  const matcher = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = text.split(matcher).filter((part) => part.length > 0);
  return parts.map((part) => ({
    text: part,
    highlighted: highlights.includes(part),
  }));
}

function HighlightedText({
  text,
  highlights,
}: {
  text: string;
  highlights: string[];
}) {
  return (
    <>
      {splitWithHighlights(text, highlights).map((part, index) => (
        <span
          key={`${part.text}-${index}`}
          className={part.highlighted ? "underline-frag" : ""}
        >
          {part.text}
        </span>
      ))}
    </>
  );
}

function InstructionList({ problem }: { problem: WritingProblem }) {
  return (
    <ul className="instruction-list">
      {getInstructions(problem).map((instruction) => (
        <li key={instruction}>{instruction}</li>
      ))}
    </ul>
  );
}

function ProblemBody({ problem }: { problem: WritingProblem }) {
  const heading = problemTitle(problem);

  if (problem.type === "英文要約") {
    return (
      <section className="paper-section summary-section">
        <h2>{heading}</h2>
        <p className="source-text">{problem.sourceText}</p>
      </section>
    );
  }

  if (problem.type === "Eメール") {
    const highlights = [
      ...(problem.underlinedQuestions ?? []),
      ...(problem.underlinedText ? [problem.underlinedText] : []),
      ...(problem.questionToAnswer ? [problem.questionToAnswer] : []),
    ];

    return (
      <section className="paper-section email-section">
        <h2>{heading}</h2>
        <div className="email-box">
          {(problem.email ?? "").split("\n").map((line, index) => (
            <p key={`${line}-${index}`}>
              <HighlightedText text={line} highlights={highlights} />
            </p>
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="paper-section topic-section">
        <h2>{heading}</h2>
        <p className={problem.topic ? "topic-text" : "question-text"}>
          {problem.topic ?? problem.question}
        </p>
      </section>
      {problem.points?.length ? (
        <section className="paper-section points-section">
          <h2>POINTS</h2>
          <ul>
            {problem.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function ProblemSheet({
  problem,
  sheetRef,
}: {
  problem: WritingProblem;
  sheetRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={sheetRef} className="pdf-paper problem-paper">
      <div className="problem-top-rule" />
      <div className="problem-side-band" />
      <div className="grade-marker">{gradeDisplay[problem.grade]}</div>
      <div className="question-marker">
        <span>{problem.questionNumber}</span>
      </div>
      <main className="problem-content">
        <h1>ライティング</h1>
        <InstructionList problem={problem} />
        <ProblemBody problem={problem} />
      </main>
    </div>
  );
}

function AnswerSheet({
  problem,
  sheetRef,
}: {
  problem: WritingProblem;
  sheetRef?: RefObject<HTMLDivElement | null>;
}) {
  const lineCount = problem.wordCount && problem.wordCount.max >= 120 ? 18 : 16;

  return (
    <div ref={sheetRef} className="pdf-paper answer-paper">
      <div className="answer-frame">
        <header className="answer-heading">
          <span className="answer-number">{problem.questionNumber}</span>
          <span>ライティング解答欄</span>
        </header>
        <div className="answer-notes">
          <p>・指示事項を守り、文字は、はっきりと分かりやすく書いてください。</p>
          <p>・大枠に囲まれた部分のみが採点の対象です。</p>
        </div>
        <div className="answer-lines" style={{ gridTemplateRows: `repeat(${lineCount}, 1fr)` }}>
          {Array.from({ length: lineCount }).map((_, index) => (
            <span key={index} />
          ))}
        </div>
      </div>
      <div className="answer-bottom-marks" />
    </div>
  );
}

function ModelAnswerSheet({
  problem,
  sheetRef,
}: {
  problem: WritingProblem;
  sheetRef?: RefObject<HTMLDivElement | null>;
}) {
  const answer = getModelAnswer(problem);
  const answerWordCount = countAnswerWords(answer);

  return (
    <div ref={sheetRef} className="pdf-paper model-paper">
      <div className="model-side-rule" />
      <main className="model-content">
        <p className="model-kicker">Reference Answer</p>
        <h1>ライティング模範解答</h1>

        <div className="model-meta">
          <span>{problem.grade}</span>
          <span>{problem.year}年度</span>
          <span>第{problem.session}回</span>
          <span>
            問題{problem.questionNumber} {problem.type}
          </span>
        </div>

        <section className="model-prompt">
          <h2>{problem.type === "英文要約" ? "TASK" : problemTitle(problem)}</h2>
          <p>
            {problem.topic ??
              problem.question ??
              problem.questionToAnswer ??
              (problem.type === "英文要約"
                ? "Read the passage and summarize it in English."
                : "Write a reply to the e-mail.")}
          </p>
        </section>

        <section className="model-answer-block">
          <h2>{problem.type === "英文要約" ? "SUMMARY" : "SAMPLE ANSWER"}</h2>
          <p>{answer}</p>
        </section>

        <footer className="model-footer">
          <span>{answerWordCount} words</span>
          {problem.wordCount ? <span>目安: {wordRange(problem)}</span> : null}
          <span>練習用の参考答案です</span>
        </footer>
      </main>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

async function makePdfBlob(element: HTMLElement) {
  await document.fonts.ready;
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2.6,
    useCORS: true,
    logging: false,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const png = await doc.embedPng(canvas.toDataURL("image/png"));
  page.drawImage(png, {
    x: 0,
    y: 0,
    width: 595.28,
    height: 841.89,
  });

  const bytes = await doc.save();
  const pdfBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([pdfBuffer], { type: "application/pdf" });
}

function makeFileName(problem: WritingProblem, kind: SheetKind) {
  return `eiken-${problem.year}-${problem.session}-${gradeSlug[problem.grade]}-q${problem.questionNumber}-${kind}.pdf`;
}

function sheetElementFor(
  kind: SheetKind,
  refs: Record<SheetKind, RefObject<HTMLDivElement | null>>,
) {
  return refs[kind].current;
}

export default function Home() {
  const problems = useMemo(
    () => writingProblemData.toSorted(sortProblems),
    [],
  );
  const [selectedId, setSelectedId] = useState(() => {
    const sorted = writingProblemData.toSorted(sortProblems);
    const initial =
      sorted.find(
        (problem) =>
          problem.grade === "2級" &&
          problem.year === 2025 &&
          problem.session === 3 &&
          problem.type === "英作文",
      ) ?? latestProblemFor(sorted);
    return initial?.id ?? "";
  });
  const [activeSheet, setActiveSheet] = useState<SheetKind>("problem");
  const [pdfUrls, setPdfUrls] = useState<PdfState>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const problemRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const pdfUrlsRef = useRef<PdfState>({});

  useEffect(() => {
    const sheet = new URLSearchParams(window.location.search).get("sheet");
    if (sheet === "answer" || sheet === "model") {
      setActiveSheet(sheet);
    }
  }, []);

  useEffect(() => {
    pdfUrlsRef.current = pdfUrls;
  }, [pdfUrls]);

  useEffect(() => {
    return () => {
      Object.values(pdfUrlsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  const selected = useMemo(
    () => problems.find((problem) => problem.id === selectedId),
    [problems, selectedId],
  );

  const grades = useMemo(
    () =>
      gradeOrder.filter((grade) =>
        problems.some((problem) => problem.grade === grade),
      ),
    [problems],
  );

  const years = useMemo(
    () =>
      uniqueSorted(
        problems
          .filter((problem) => !selected || problem.grade === selected.grade)
          .map((problem) => problem.year),
        true,
      ),
    [problems, selected],
  );

  const sessions = useMemo(
    () =>
      uniqueSorted(
        problems
          .filter((problem) => !selected || problem.grade === selected.grade)
          .filter((problem) => !selected || problem.year === selected.year)
          .map((problem) => problem.session),
        true,
      ),
    [problems, selected],
  );

  const visibleProblems = useMemo(
    () =>
      problems.filter(
        (problem) =>
          selected &&
          problem.grade === selected.grade &&
          problem.year === selected.year &&
          problem.session === selected.session,
      ),
    [problems, selected],
  );

  const resetPdfUrls = useCallback(() => {
    setPdfUrls((current) => {
      Object.values(current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      return {};
    });
  }, []);

  const selectProblem = useCallback(
    (problem?: WritingProblem) => {
      if (!problem) return;
      setSelectedId(problem.id);
      resetPdfUrls();
    },
    [resetPdfUrls],
  );

  const updateByGrade = useCallback(
    (grade: string) => {
      selectProblem(latestProblemFor(problems, grade as WritingProblem["grade"]));
    },
    [problems, selectProblem],
  );

  const updateByYear = useCallback(
    (year: string) => {
      if (!selected) return;
      selectProblem(latestProblemFor(problems, selected.grade, Number(year)));
    },
    [problems, selected, selectProblem],
  );

  const updateBySession = useCallback(
    (session: string) => {
      if (!selected) return;
      selectProblem(
        latestProblemFor(
          problems,
          selected.grade,
          selected.year,
          Number(session),
        ),
      );
    },
    [problems, selected, selectProblem],
  );

  const ensurePdf = useCallback(
    async (kind: SheetKind) => {
      const cached = pdfUrls[kind];
      if (cached) return cached;

      const element = sheetElementFor(kind, {
        problem: problemRef,
        answer: answerRef,
        model: modelRef,
      });
      if (!element || !selected) return "";

      setError("");
      setIsGenerating(true);
      try {
        const blob = await makePdfBlob(element);
        const url = URL.createObjectURL(blob);
        setPdfUrls((current) => {
          if (current[kind]) URL.revokeObjectURL(current[kind]);
          return { ...current, [kind]: url };
        });
        return url;
      } catch {
        setError("PDFを生成できませんでした。");
        return "";
      } finally {
        setIsGenerating(false);
      }
    },
    [pdfUrls, selected],
  );

  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => {
      void ensurePdf(activeSheet);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [activeSheet, ensurePdf, selected]);

  const downloadPdf = useCallback(
    async (kind: SheetKind) => {
      if (!selected) return;
      const url = await ensurePdf(kind);
      if (!url) return;
      const link = document.createElement("a");
      link.href = url;
      link.download = makeFileName(selected, kind);
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    [ensurePdf, selected],
  );

  const activeUrl = pdfUrls[activeSheet];

  return (
    <main className="app-shell">
      <section className="control-panel" aria-label="問題選択">
        <div className="brand-block">
          <div className="brand-mark">
            <FileText size={21} />
          </div>
          <div>
            <p className="kicker">EIKEN Writing</p>
            <h1>英検ライティング用紙</h1>
          </div>
        </div>

        <div className="control-grid">
          <SelectField
            label="級"
            value={selected?.grade ?? ""}
            onChange={updateByGrade}
          >
            {grades.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="年度"
            value={selected?.year ? String(selected.year) : ""}
            onChange={updateByYear}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="回"
            value={selected?.session ? String(selected.session) : ""}
            onChange={updateBySession}
          >
            {sessions.map((session) => (
              <option key={session} value={session}>
                第{session}回
              </option>
            ))}
          </SelectField>

          <SelectField
            label="問題"
            value={selected?.id ?? ""}
            onChange={(id) => {
              setSelectedId(id);
              resetPdfUrls();
            }}
          >
            {visibleProblems.map((problem) => (
              <option key={problem.id} value={problem.id}>
                {problem.questionNumber} {problem.type}
              </option>
            ))}
          </SelectField>
        </div>

        {selected ? (
          <div className="selected-summary">
            <span>{selected.year}年度</span>
            <span>第{selected.session}回</span>
            <span>{selected.grade}</span>
            <span>
              {selected.questionNumber} {selected.type}
            </span>
            {selected.wordCount ? <span>{wordRange(selected)}</span> : null}
          </div>
        ) : null}

        <div className="sheet-switch" role="tablist" aria-label="表示用紙">
          {(["problem", "answer", "model"] as SheetKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={activeSheet === kind}
              className={activeSheet === kind ? "is-active" : ""}
              onClick={() => setActiveSheet(kind)}
            >
              <Eye size={16} />
              {sheetLabels[kind]}
            </button>
          ))}
        </div>

        <div className="download-stack">
          <button type="button" onClick={() => void downloadPdf("problem")}>
            <FileDown size={17} />
            問題用紙PDF
          </button>
          <button type="button" onClick={() => void downloadPdf("answer")}>
            <Download size={17} />
            解答用紙PDF
          </button>
          <button type="button" onClick={() => void downloadPdf("model")}>
            <BookOpenCheck size={17} />
            模範解答PDF
          </button>
        </div>

        <div className="data-count">
          <Layers2 size={16} />
          <span>{problems.length} writing prompts</span>
        </div>
      </section>

      <section className="preview-panel" aria-label="PDFプレビュー">
        <div className="preview-toolbar">
          <div>
            <p>{sheetLabels[activeSheet]}</p>
            <h2>
              {selected
                ? `${selected.grade} ${selected.year}年度 第${selected.session}回 問題${selected.questionNumber}`
                : "読み込み中"}
            </h2>
          </div>
          <button type="button" onClick={() => void downloadPdf(activeSheet)}>
            <Printer size={17} />
            ダウンロード
          </button>
        </div>

        <div className="pdf-stage paper-preview-stage">
          {selected ? (
            <div className="paper-preview">
              {activeSheet === "problem" ? (
                <ProblemSheet problem={selected} />
              ) : activeSheet === "answer" ? (
                <AnswerSheet problem={selected} />
              ) : (
                <ModelAnswerSheet problem={selected} />
              )}
            </div>
          ) : null}
          {!activeUrl && isGenerating ? (
            <div className="generating-state">
              <Loader2 size={28} />
              <span>PDF生成中</span>
            </div>
          ) : null}
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </section>

      {selected ? (
        <div className="render-cache" aria-hidden="true">
          <ProblemSheet problem={selected} sheetRef={problemRef} />
          <AnswerSheet problem={selected} sheetRef={answerRef} />
          <ModelAnswerSheet problem={selected} sheetRef={modelRef} />
        </div>
      ) : null}
    </main>
  );
}
