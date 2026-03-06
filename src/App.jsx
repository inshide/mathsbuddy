import { useState, useRef } from "react";

// ─── PROMPTS ──────────────────────────────────────────────────────────────────

const SYSTEM_ANALYSE = `You are Maths Buddy, a warm and encouraging maths tutor for New Zealand Year 5–6 students (ages 9–11). Your role is to help students think through problems themselves — never give the final answer.

When given a maths problem image, respond with ONLY a valid JSON object (no markdown, no backticks, no extra text):
{
  "topic": "short topic name e.g. Multiplication, Fractions, Area",
  "fullText": "The complete problem text transcribed word-for-word from the image",
  "givenPhrases": ["exact substring from fullText showing a concrete given fact or number"],
  "findPhrases": ["exact substring from fullText describing what must be found"],
  "find": "What does the student need to find? (1 sentence, child-friendly)",
  "given": ["Full sentence facts e.g. 'Grandma gave Jack 35 marbles', 'Jack ended up with 87 marbles'. Never just a bare number. Never include the unknown."],
  "approach": "One friendly sentence about the overall strategy, without giving away steps",
  "firstQuestion": "Ask ONE guiding question to help the student think about the first step. Warm and encouraging.",
  "unit": "the unit of the answer e.g. marbles, cm, dollars, kg"
}
RULES:
- givenPhrases/findPhrases must be exact substrings of fullText
- given must ONLY contain explicitly stated facts — never the unknown quantity
- Focus on what is NEEDED to solve the problem. Include ALL numerical facts in given, even remainders or leftovers — these are part of the maths.
- However, do NOT include what happened to those items (e.g. "Melinda ate the extra one" is irrelevant — the fact that there was 1 left over IS relevant, but what she did with it is not). Keep given to pure numerical facts only.
- approach should focus on the core calculation path. Do not draw attention to irrelevant actions (eating, discarding, giving away) — only mention the numbers that matter.
Use NZ English spelling. Keep it simple and friendly.`;

const SYSTEM_HINT_STEPS = `You are Maths Buddy, a warm maths tutor for NZ Year 5–6 students.
Generate exactly 3 hint steps as a JSON array. Follow this exact structure for each step:

STEP 1 — Identify the numbers: Fill individual number blanks in a sentence.
STEP 2 — Build the equation: The explanation walks through the story in plain English — what J stands for, what happened, what the result was — but NEVER writes out any part of the equation or shows any numbers in a maths structure. Just describe the situation in words, then ask "Can you write that as a maths equation?". ONE single wide blank.
STEP 3 — Write the solving expression: Explain in plain words what operation is needed to isolate J and why (e.g. "We need to work backwards from the total"). Do NOT write any numbers or partial expressions. End with "Write the calculation:". ONE single wide blank.

Respond with ONLY a valid JSON array (no markdown, no backticks):
[
  {
    "stepNum": 1,
    "title": "Spot the numbers",
    "explanation": "Let's find the numbers we know from the problem.",
    "template": "Jack received [s1b1] marbles from Grandma, and ended up with [s1b2] marbles altogether.",
    "blanks": [
      { "id": "s1b1", "answer": "35", "width": 3 },
      { "id": "s1b2", "answer": "87", "width": 3 }
    ],
    "successMsg": "Great! You found the key numbers! 🎉"
  },
  {
    "stepNum": 2,
    "title": "Write the equation",
    "explanation": "Let's call the number of marbles Jack started with J. Grandma gave him some more, and after that he counted all his marbles. Can you write that as a maths equation?",
    "template": "[s2b1]",
    "blanks": [
      { "id": "s2b1", "answer": "J + 35 = 87", "width": 12 }
    ],
    "successMsg": "Perfect equation! 🎉"
  },
  {
    "stepNum": 3,
    "title": "Set up the calculation",
    "explanation": "Great! Now we need to work backwards to find J. Think about what operation would undo the adding. Write the calculation:",
    "template": "J = [s3b1]",
    "blanks": [
      { "id": "s3b1", "answer": "87 - 35", "width": 8 }
    ],
    "successMsg": "Spot on! Now work out that calculation and write your answer below! 🎯"
  }
]

RULES:
- Blank IDs must be UNIQUE across ALL steps — use format s1b1, s1b2, s2b1, s3b1 etc
- Step 1: multiple narrow blanks for individual numbers only
- Step 2: exactly ONE wide blank — student writes the full equation from scratch (e.g. "J + 35 = 87", "4 × L = 20", "area = 6 × 4")
- Step 3: exactly ONE wide blank — student writes the solving expression (e.g. "87 - 35", "20 ÷ 4", "6 × 4")
- width for step 1 blanks: 2–4. Width for step 2–3 blanks: 8–14 depending on expression length
- Adapt the variable name and operators to the actual problem (use L for length, A for area, etc.)
- Be generous in SYSTEM_CHECK_BLANK — accept equivalent forms, different variable letters, spaces around operators
- NZ English, warm, encouraging`;

const SYSTEM_CHECK_BLANK = `You are Maths Buddy checking a student's fill-in-the-blank answer.
Student is NZ Year 5-6 (age 9-11).

Be GENEROUS — accept:
- Any equivalent form of an equation (e.g. "35 + J = 87" is the same as "J + 35 = 87")
- Any letter variable for the unknown (J, j, x, n, C, etc.)
- Spaces or no spaces around operators
- "×" or "*" or "x" for multiplication, "÷" or "/" for division
- "87-35" same as "87 - 35"
- For expressions like "87 - 35", also accept the evaluated answer if they calculated it
- Remainder / division notation: "C/6=9...1" or "C÷6=9 r 1" or "C÷6=9 remainder 1" are all valid ways to express the same relationship as "6×9+1=C" — accept them as correct
- Inverse/rearranged equations are correct: if the expected answer is "6×9+1=C", then "C/6=9...1" is mathematically equivalent and must be marked correct

Respond ONLY with valid JSON (no markdown):
{
  "correct": true or false,
  "feedback": "One short encouraging sentence. If wrong, give a gentle nudge without revealing the answer."
}`;

const SYSTEM_CHECK = `You are Maths Buddy, a maths tutor for NZ Year 5–6 students.
Check the student's final answer and respond with ONLY a valid JSON object (no markdown):
{
  "correct": true or false,
  "feedback": "Encouraging feedback sentence.",
  "correctAnswer": "The correct answer with unit (only if wrong)",
  "whereWrong": "1–2 sentences explaining the mistake (only if wrong)",
  "fullSolution": "Complete numbered step-by-step solution (only if wrong)",
  "encouragement": "Short uplifting closing sentence"
}
Be GENEROUS when checking:
- Accept the evaluated result of any correct expression (e.g. if answer is "73%", accept "73" or "73%")
- If a student writes a calculation like "73 ÷ 100 × 100" that simplifies to the correct answer, mark it correct
- Accept answers with or without units if the number is right
- Accept equivalent forms (73/100 × 100 = 73, so "73" is correct for a percentage question where score is 73 out of 100)`;

// ─── API ──────────────────────────────────────────────────────────────────────

const API_KEY = import.meta.env.VITE_GROQ_KEY || "";

async function callClaude(system, userContent, maxTokens = 1500) {
  // Convert Anthropic-style userContent to OpenAI-compatible messages
  // Groq supports vision via llama-4-scout-17b-16e-instruct
  const userParts = [];
  const contents = typeof userContent === "string"
    ? [{ type: "text", text: userContent }]
    : userContent;

  for (const item of contents) {
    if (item.type === "text") {
      userParts.push({ type: "text", text: item.text });
    } else if (item.type === "image" && item.source?.type === "base64") {
      userParts.push({
        type: "image_url",
        image_url: { url: `data:${item.source.media_type};base64,${item.source.data}` }
      });
    }
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userParts.length === 1 && userParts[0].type === "text" ? userParts[0].text : userParts }
      ],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.choices?.[0]?.message?.content || "";
}

function parseJSON(raw) {
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { return null; }
}

// ─── HIGHLIGHTED TEXT ─────────────────────────────────────────────────────────

function HighlightedText({ text, givenPhrases = [], findPhrases = [] }) {
  if (!text) return null;
  const ranges = [];
  const addRanges = (phrases, type) => {
    for (const phrase of phrases) {
      if (!phrase) continue;
      let idx = 0;
      while (true) {
        const pos = text.indexOf(phrase, idx);
        if (pos === -1) break;
        ranges.push({ start: pos, end: pos + phrase.length, type });
        idx = pos + 1;
      }
    }
  };
  addRanges(givenPhrases, "given");
  addRanges(findPhrases, "find");
  ranges.sort((a, b) => a.start - b.start);
  const segs = [];
  let cur = 0;
  for (const r of ranges) {
    if (r.start > cur) segs.push({ text: text.slice(cur, r.start), type: "plain" });
    if (r.start >= cur) { segs.push({ text: text.slice(r.start, r.end), type: r.type }); cur = r.end; }
  }
  if (cur < text.length) segs.push({ text: text.slice(cur), type: "plain" });
  return (
    <p style={{ fontSize: "1rem", lineHeight: 1.9, margin: 0 }}>
      {segs.map((s, i) => {
        if (s.type === "given") return <mark key={i} style={{ background: "#b3f0e8", color: "#0a6658", borderRadius: 4, padding: "2px 4px", fontWeight: 700 }}>{s.text}</mark>;
        if (s.type === "find") return <mark key={i} style={{ background: "#ffe0c2", color: "#b84800", borderRadius: 4, padding: "2px 4px", fontWeight: 700 }}>{s.text}</mark>;
        return <span key={i}>{s.text}</span>;
      })}
    </p>
  );
}

// ─── STEP CARD ────────────────────────────────────────────────────────────────

function StepCard({ step, onComplete, completed = false }) {
  // Each StepCard has its own completely isolated inputs keyed by this step's blank IDs
  const initInputs = () => {
    const obj = {};
    for (const b of (step.blanks || [])) obj[b.id] = "";
    return obj;
  };

  const [inputs, setInputs] = useState(initInputs);
  const [status, setStatus] = useState(completed ? "done" : "idle"); // idle | checking | wrong | done
  const [feedback, setFeedback] = useState("");
  const [showAnswer, setShowAnswer] = useState(completed);

  const blankMap = {};
  for (const b of (step.blanks || [])) blankMap[b.id] = b;

  // Parse template into segments
  const templateParts = [];
  {
    const regex = /\[([^\]]+)\]/g;
    let last = 0, m;
    while ((m = regex.exec(step.template)) !== null) {
      if (m.index > last) templateParts.push({ type: "text", val: step.template.slice(last, m.index) });
      templateParts.push({ type: "blank", id: m[1] });
      last = m.index + m[0].length;
    }
    if (last < step.template.length) templateParts.push({ type: "text", val: step.template.slice(last) });
  }

  function setInput(id, val) {
    setInputs(prev => ({ ...prev, [id]: val }));
    if (status === "wrong") setStatus("idle");
  }

  const allFilled = (step.blanks || []).every(b => inputs[b.id]?.trim());

  async function checkStep() {
    if (!allFilled || status === "checking" || status === "done") return;
    setStatus("checking");
    try {
      const desc = (step.blanks || []).map(b =>
        `Blank "${b.id}": expected "${b.answer}", student wrote "${inputs[b.id]}"`
      ).join("\n");
      const raw = await callClaude(SYSTEM_CHECK_BLANK,
        `Step: "${step.title}"\nTemplate: "${step.template}"\n${desc}\nAre all the student's answers correct?`
        , 300);
      const r = parseJSON(raw);
      if (!r) throw new Error("parse");
      setFeedback(r.feedback || "");
      if (r.correct) {
        setStatus("done");
        setTimeout(() => onComplete(), 700);
      } else {
        setStatus("wrong");
      }
    } catch {
      setFeedback("Couldn't check that — please try again!");
      setStatus("wrong");
    }
  }

  function tryAgain() {
    setInputs(initInputs());
    setStatus("idle");
    setFeedback("");
    setShowAnswer(false);
  }

  function revealAnswer() {
    setShowAnswer(true);
    setStatus("done");
    // Advance to next step after a visible delay (so student sees the revealed answer first)
    setTimeout(() => onComplete(), 1200);
  }

  return (
    <div style={{
      background: status === "done" ? "#f0fdf6" : "#f8f6ff",
      border: `2px solid ${status === "done" ? "#34c77b" : status === "wrong" ? "#e84855" : "#e0d8f8"}`,
      borderRadius: 14, padding: "14px 16px",
      transition: "border-color 0.25s, background 0.25s"
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
          background: status === "done" ? "linear-gradient(135deg,#34c77b,#28a869)" : "linear-gradient(135deg,#7c5cbf,#6d4bb5)",
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Baloo 2',cursive", fontSize: "0.82rem", fontWeight: 800
        }}>{status === "done" ? "✓" : step.stepNum}</div>
        <div style={{ fontFamily: "'Baloo 2',cursive", fontSize: "0.95rem", fontWeight: 800, color: status === "done" ? "#1a7a4e" : "#4a3880" }}>
          {step.title}
        </div>
      </div>

      {/* Explanation */}
      <p style={{ fontSize: "0.87rem", color: "#5a5a6e", lineHeight: 1.6, margin: "0 0 10px" }}>{step.explanation}</p>

      {/* Template with blanks */}
      <div style={{
        background: "#fff", borderRadius: 10, padding: "12px 16px",
        fontFamily: "'Baloo 2',cursive", fontSize: "1.05rem", fontWeight: 700,
        lineHeight: 2.4, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px",
        marginBottom: 10
      }}>
        {templateParts.map((p, i) => {
          if (p.type === "text") return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{p.val}</span>;
          const b = blankMap[p.id];
          if (!b) return null;
          const isDone = status === "done";
          const isWrong = status === "wrong";
          const displayVal = isDone && showAnswer ? b.answer : inputs[p.id] || "";
          return (
            <input
              key={`${step.stepNum}-${p.id}`}   // stable unique key per step+blank
              value={displayVal}
              onChange={e => setInput(p.id, e.target.value)}
              onKeyDown={e => e.key === "Enter" && checkStep()}
              disabled={isDone}
              placeholder="?"
              style={{
                width: Math.max(44, (b.width || 3) * 16 + 20) + "px",
                padding: "3px 6px",
                border: "2px solid",
                borderColor: isDone ? "#34c77b" : isWrong ? "#e84855" : "#a090d0",
                borderRadius: 8,
                fontFamily: "'Baloo 2',cursive",
                fontSize: "1rem", fontWeight: 800,
                textAlign: "center", outline: "none",
                background: isDone ? "#e6faf1" : isWrong ? "#fff0f0" : "#fdfcff",
                color: isDone ? "#1a7a4e" : "#2d2d2d",
                transition: "all 0.2s"
              }}
            />
          );
        })}
      </div>

      {/* Success */}
      {status === "done" && (
        <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#1a7a4e" }}>
          ✅ {step.successMsg}
        </div>
      )}

      {/* Wrong feedback + Try Again / Show Answer */}
      {status === "wrong" && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: "0.87rem", color: "#c0392b", fontWeight: 600, marginBottom: 8 }}>
            ❌ {feedback}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={tryAgain} style={{
              background: "#fff0ea", color: "#ff6b35", border: "2px solid #ff6b3560",
              padding: "7px 16px", borderRadius: 50, fontFamily: "'Nunito',sans-serif",
              fontSize: "0.82rem", fontWeight: 800, cursor: "pointer"
            }}>🔄 Try Again</button>
            <button onClick={revealAnswer} style={{
              background: "#f2edfb", color: "#7c5cbf", border: "2px solid #7c5cbf60",
              padding: "7px 16px", borderRadius: 50, fontFamily: "'Nunito',sans-serif",
              fontSize: "0.82rem", fontWeight: 800, cursor: "pointer"
            }}>💡 Show Answer</button>
          </div>
        </div>
      )}

      {/* Check button */}
      {(status === "idle" || status === "checking") && (step.blanks || []).length > 0 && (
        <button
          onClick={checkStep}
          disabled={!allFilled || status === "checking"}
          style={{
            background: allFilled && status !== "checking" ? "linear-gradient(135deg,#7c5cbf,#6d4bb5)" : "#e0d8f8",
            color: allFilled && status !== "checking" ? "#fff" : "#b0a0d8",
            border: "none", padding: "7px 20px", borderRadius: 50,
            fontFamily: "'Nunito',sans-serif", fontSize: "0.82rem", fontWeight: 800,
            cursor: allFilled ? "pointer" : "not-allowed", transition: "all 0.2s", marginTop: 2
          }}
        >{status === "checking" ? "Checking…" : "Check ✓"}</button>
      )}
    </div>
  );
}

// ─── SHARED UI ────────────────────────────────────────────────────────────────

function Tag({ color, children }) {
  const c = { orange: "#ff6b35", teal: "#0cb8a6", yellow: "#e6a800", purple: "#7c5cbf", green: "#28a869", red: "#e84855" }[color] || "#0cb8a6";
  return <span style={{ display: "inline-block", fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", padding: "3px 10px", borderRadius: 8, background: `${c}18`, color: c, border: `1.5px solid ${c}40`, marginBottom: 8 }}>{children}</span>;
}

function Bubble({ role, children }) {
  const isBot = role === "assistant";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: isBot ? "row" : "row-reverse", marginBottom: 4 }}>
      <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", background: isBot ? "linear-gradient(135deg,#0cb8a6,#0891b2)" : "linear-gradient(135deg,#7c5cbf,#6d4bb5)" }}>{isBot ? "🤖" : "👦"}</div>
      <div style={{ maxWidth: "88%", padding: "13px 17px", borderRadius: 18, fontSize: "0.9rem", lineHeight: 1.65, ...(isBot ? { background: "#fff", border: "2px solid #ece8e0", borderTopLeftRadius: 4, boxShadow: "0 3px 12px rgba(0,0,0,0.07)" } : { background: "linear-gradient(135deg,#7c5cbf,#6d4bb5)", color: "#fff", borderTopRightRadius: 4 }) }}>{children}</div>
    </div>
  );
}

function Dots() {
  return (
    <Bubble role="assistant">
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        {[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: ["#0cb8a6", "#ff6b35", "#7c5cbf"][i], animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
      </div>
    </Bubble>
  );
}

function btn(color, filled) {
  const map = { purple: ["#7c5cbf", "#f2edfb"], orange: ["#ff6b35", "#fff0ea"], teal: ["#0cb8a6", "#e0faf7"], green: ["#34c77b", "#e6faf1"], red: ["#e84855", "#fdeaeb"] };
  const [c, bg] = map[color] || map.teal;
  return filled
    ? { background: c, color: "#fff", border: "none", padding: "9px 20px", borderRadius: 50, fontFamily: "'Nunito',sans-serif", fontSize: "0.85rem", fontWeight: 800, marginTop: 8, cursor: "pointer" }
    : { background: bg, color: c, border: `2px solid ${c}40`, padding: "7px 14px", borderRadius: 50, fontFamily: "'Nunito',sans-serif", fontSize: "0.8rem", fontWeight: 800, cursor: "pointer" };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function MathsBuddy() {
  const [imgB64, setImgB64] = useState(null);
  const [imgSrc, setImgSrc] = useState(null);
  const [imgType, setImgType] = useState("image/png");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("upload");
  const [view, setView] = useState("solve");
  const [analysis, setAnalysis] = useState(null);
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("mathsbuddy_history");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [answerText, setAnswerText] = useState("");
  const [workingB64, setWorkingB64] = useState(null);
  const [workingName, setWorkingName] = useState("");
  const [workingType, setWorkingType] = useState("image/png");
  const [hintSteps, setHintSteps] = useState([]);
  const [visibleIdx, setVisibleIdx] = useState(-1); // -1 = no steps shown yet
  const [submittedAnswer, setSubmittedAnswer] = useState(null);
  const fileRef = useRef();
  const workingRef = useRef();
  const bottomRef = useRef();

  function addMsg(role, content) {
    setMessages(p => [...p, { role, content }]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  function readFile(file, cb) { const r = new FileReader(); r.onload = e => cb(e.target.result); r.readAsDataURL(file); }
  function handleImg(f) { if (!f?.type.startsWith("image/")) return; readFile(f, s => { setImgSrc(s); setImgB64(s.split(",")[1]); setImgType(f.type); }); }
  function handleWorking(f) { if (!f?.type.startsWith("image/")) return; readFile(f, s => { setWorkingB64(s.split(",")[1]); setWorkingName(f.name); setWorkingType(f.type); }); }

  function onStepComplete(idx) {
    setTimeout(() => {
      setVisibleIdx(v => Math.max(v, idx + 1)); // idx+1 may exceed hintSteps.length, which triggers answer box
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 150);
    }, 400);
  }

  async function analyse() {
    setLoading(true); setPhase("guided");
    try {
      const raw = await callClaude(SYSTEM_ANALYSE, [
        { type: "image", source: { type: "base64", media_type: imgType, data: imgB64 } },
        { type: "text", text: "Please analyse this maths problem." }
      ]);
      const p = parseJSON(raw);
      if (!p) throw new Error("parse failed: " + raw);
      setAnalysis(p);
      addMsg("assistant",
        <div>
          <div style={{ background: "#f8f6ff", border: "2px solid #e8e0f8", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", color: "#9b8abf", marginBottom: 10 }}>📄 The Problem</div>
            <HighlightedText text={p.fullText} givenPhrases={p.givenPhrases || []} findPhrases={p.findPhrases || []} />
          </div>
          <Tag color="teal">📋 What we already know</Tag>
          <ul style={{ paddingLeft: 18, marginTop: 4, marginBottom: 12 }}>{(p.given || []).map((g, i) => <li key={i} style={{ marginBottom: 4 }}>{g}</li>)}</ul>
          <Tag color="orange">🎯 What we need to find</Tag>
          <p style={{ marginBottom: 12, marginTop: 4 }}>{p.find}</p>
          <div style={{ background: "#fff8e0", borderLeft: "4px solid #ffc234", padding: "10px 14px", borderRadius: "0 10px 10px 0", margin: "12px 0", fontWeight: 700 }}>💡 {p.approach}</div>
          <p><strong>Ready to start?</strong> {p.firstQuestion}</p>
          <button onClick={startHints} style={btn("purple", true)}>🆘 I need a hint</button>
        </div>
      );
    } catch (e) { addMsg("assistant", <p>⚠️ API 오류: {e.message}</p>); setPhase("upload"); }
    setLoading(false);
  }

  async function startHints() {
    addMsg("user", <p>I need a hint please 🙏</p>);
    setLoading(true); setPhase("hint");
    try {
      const raw = await callClaude(SYSTEM_HINT_STEPS, [
        { type: "image", source: { type: "base64", media_type: imgType, data: imgB64 } },
        { type: "text", text: `Problem: ${JSON.stringify(analysis)}\nGenerate fill-in-the-blank hint steps. Unit: "${analysis?.unit || ""}". Remember: blanks contain ONLY numbers/variables/expressions, never English words.` }
      ], 2000);
      const steps = parseJSON(raw);
      if (!Array.isArray(steps) || steps.length === 0) throw new Error("Invalid: " + raw);
      setHintSteps(steps);
      setVisibleIdx(0);
      addMsg("assistant", <div style={{ fontSize: "0.9rem" }}>Let's work through this together! Fill in each step 👇</div>);
    } catch (e) { addMsg("assistant", <p>⚠️ Hint error: {e.message}</p>); }
    setLoading(false);
  }

  async function checkAnswer() {
    if (!answerText.trim() && !workingB64) return;
    addMsg("user", <p>My answer is: <strong>{answerText || "(photo uploaded)"}</strong></p>);
    const ans = answerText; setLoading(true);
    try {
      const content = [{ type: "image", source: { type: "base64", media_type: imgType, data: imgB64 } }];
      if (workingB64) content.push({ type: "image", source: { type: "base64", media_type: workingType, data: workingB64 } });
      content.push({ type: "text", text: `Problem: ${JSON.stringify(analysis)}\nAnswer: "${ans}"\nCheck and return JSON.` });
      const raw = await callClaude(SYSTEM_CHECK, content);
      const r = parseJSON(raw);
      if (!r) { addMsg("assistant", <p>{raw}</p>); setLoading(false); return; }

      const newEntry = {
        id: Date.now(),
        topic: analysis?.topic || "Problem", text: analysis?.fullText || "",
        correct: r.correct, answer: ans,
        date: new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "short" }),
        imgSrc: imgSrc, imgB64: imgB64, imgType: imgType,
        analysis: analysis,
        savedHintSteps: hintSteps,
        submittedAnswer: { text: ans, correct: r.correct }
      };
      setHistory(h => {
        const updated = [...h, newEntry];
        try { localStorage.setItem("mathsbuddy_history", JSON.stringify(updated)); } catch { }
        return updated;
      });
      setSubmittedAnswer({ text: ans, correct: r.correct });
      setPhase("done");

      if (r.correct) {
        addMsg("assistant",
          <div>
            <div style={{ background: "#e6faf1", borderLeft: "4px solid #34c77b", padding: "10px 14px", borderRadius: "0 10px 10px 0", fontWeight: 700, marginBottom: 10 }}>🎉 {r.feedback}</div>
            <p>{r.encouragement}</p>
          </div>
        );
      } else {
        addMsg("assistant",
          <div>
            <div style={{ background: "#fdeaeb", borderLeft: "4px solid #e84855", padding: "10px 14px", borderRadius: "0 10px 10px 0", marginBottom: 10 }}>
              <Tag color="red">Not quite right</Tag>
              <p style={{ marginTop: 4 }}>{r.feedback}</p>
            </div>
            {r.whereWrong && <div style={{ marginBottom: 10 }}><Tag color="purple">🔍 Where it went wrong</Tag><p>{r.whereWrong}</p></div>}
            {r.fullSolution && <div style={{ marginBottom: 10 }}><Tag color="yellow">📝 Full solution</Tag><div style={{ whiteSpace: "pre-line", marginTop: 6 }}>{r.fullSolution}</div></div>}
            <div style={{ background: "#e6faf1", padding: "10px 14px", borderRadius: 10, marginTop: 8 }}>💪 {r.encouragement}</div>
          </div>
        );
      }
    } catch (e) { addMsg("assistant", <p>⚠️ 오류: {e.message}</p>); }
    setLoading(false);
  }

  function reset() {
    setImgB64(null); setImgSrc(null); setImgType("image/png"); setMessages([]); setLoading(false);
    setPhase("upload"); setAnalysis(null); setAnswerText(""); setWorkingB64(null); setWorkingName(""); setWorkingType("image/png");
    setHintSteps([]); setVisibleIdx(-1); setSubmittedAnswer(null);
  }

  function replayFromHistory(h) {
    if (!h.analysis) { reset(); return; }
    const p = h.analysis;
    setImgSrc(h.imgSrc); setImgB64(h.imgB64); setImgType(h.imgType || "image/png");
    setLoading(false); setAnswerText(""); setWorkingB64(null); setWorkingName(""); setWorkingType("image/png");
    setHintSteps([]); setVisibleIdx(-1);
    setAnalysis(p);
    setSubmittedAnswer(h.submittedAnswer || null);
    setPhase("done");
    setView("solve");
    // Rebuild the analysis message + answer user/bot pair
    const analysisMsg = {
      role: "assistant", content: (
        <div>
          <div style={{ background: "#f8f6ff", border: "2px solid #e8e0f8", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", color: "#9b8abf", marginBottom: 10 }}>📄 The Problem</div>
            <HighlightedText text={p.fullText} givenPhrases={p.givenPhrases || []} findPhrases={p.findPhrases || []} />
          </div>
          <Tag color="teal">📋 What we already know</Tag>
          <ul style={{ paddingLeft: 18, marginTop: 4, marginBottom: 12 }}>{(p.given || []).map((g, i) => <li key={i} style={{ marginBottom: 4 }}>{g}</li>)}</ul>
          <Tag color="orange">🎯 What we need to find</Tag>
          <p style={{ marginBottom: 12, marginTop: 4 }}>{p.find}</p>
          <div style={{ background: "#fff8e0", borderLeft: "4px solid #ffc234", padding: "10px 14px", borderRadius: "0 10px 10px 0", margin: "12px 0", fontWeight: 700 }}>💡 {p.approach}</div>
          <p><strong>Ready to start?</strong> {p.firstQuestion}</p>
        </div>
      )
    };
    const answerUserMsg = h.submittedAnswer
      ? { role: "user", content: <p>My answer is: <strong>{h.submittedAnswer.text}</strong></p> }
      : null;
    setMessages(answerUserMsg ? [analysisMsg, answerUserMsg] : [analysisMsg]);
  }

  function retryFromHistory(h) {
    if (!h.analysis) { reset(); return; }
    const p = h.analysis;
    setImgSrc(h.imgSrc); setImgB64(h.imgB64); setImgType(h.imgType || "image/png");
    setMessages([]); setLoading(false); setAnswerText(""); setWorkingB64(null); setWorkingName(""); setWorkingType("image/png");
    setHintSteps([]); setVisibleIdx(-1); setSubmittedAnswer(null);
    setAnalysis(p);
    setPhase("guided");
    setView("solve");
    setMessages([{
      role: "assistant", content: (
        <div>
          <div style={{ background: "#f8f6ff", border: "2px solid #e8e0f8", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", color: "#9b8abf", marginBottom: 10 }}>📄 The Problem</div>
            <HighlightedText text={p.fullText} givenPhrases={p.givenPhrases || []} findPhrases={p.findPhrases || []} />
          </div>
          <Tag color="teal">📋 What we already know</Tag>
          <ul style={{ paddingLeft: 18, marginTop: 4, marginBottom: 12 }}>{(p.given || []).map((g, i) => <li key={i} style={{ marginBottom: 4 }}>{g}</li>)}</ul>
          <Tag color="orange">🎯 What we need to find</Tag>
          <p style={{ marginBottom: 12, marginTop: 4 }}>{p.find}</p>
          <div style={{ background: "#fff8e0", borderLeft: "4px solid #ffc234", padding: "10px 14px", borderRadius: "0 10px 10px 0", margin: "12px 0", fontWeight: 700 }}>💡 {p.approach}</div>
          <p><strong>Ready to start?</strong> {p.firstQuestion}</p>
          <button onClick={startHints} style={btn("purple", true)}>🆘 I need a hint</button>
        </div>
      )
    }]);
  }

  const allStepsDone = hintSteps.length > 0 && visibleIdx >= hintSteps.length;
  const showAnswerBox = (phase === "guided" || phase === "hint" || phase === "done") && !loading && (hintSteps.length === 0 || allStepsDone);

  return (
    <div style={{ fontFamily: "'Nunito',sans-serif", background: "#fef9f0", minHeight: "100vh", color: "#2d2d2d" }}>
      {!API_KEY && (
        <div style={{ background: "#fdeaeb", borderBottom: "2px solid #e84855", padding: "10px 22px", fontSize: "0.82rem", fontWeight: 700, color: "#c0392b", textAlign: "center" }}>
          ⚠️ API 키가 없어요! .env 파일에 VITE_GROQ_KEY를 추가해주세요.
        </div>
      )}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap');
        @keyframes dotBounce { 0%,80%,100%{transform:scale(0.6);opacity:0.5} 40%{transform:scale(1);opacity:1} }
        @keyframes floatUp { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes slideIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing:border-box }
        button { transition:all 0.18s; cursor:pointer }
        button:hover:not(:disabled) { opacity:0.85; transform:translateY(-1px) }
        mark { background:none }
      `}</style>

      {/* HEADER */}
      <div style={{ background: "#fff", borderBottom: "3px solid #ece8e0", padding: "12px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
        <div style={{ fontFamily: "'Baloo 2',cursive", fontSize: "1.4rem", fontWeight: 800, color: "#ff6b35", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: "#ff6b35", color: "#fff", width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem" }}>✏️</span>
          Maths Buddy
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => { reset(); }}
            style={{ padding: "7px 16px", borderRadius: 50, border: "2px solid", fontFamily: "'Nunito',sans-serif", fontSize: "0.8rem", fontWeight: 800, background: view === "solve" ? "#ff6b35" : "#fff0ea", color: view === "solve" ? "#fff" : "#ff6b35", borderColor: view === "solve" ? "#ff6b35" : "#ff6b3540" }}>
            ✏️ Solve New
          </button>
          <button onClick={() => setView("history")}
            style={{ padding: "7px 16px", borderRadius: 50, border: "2px solid", fontFamily: "'Nunito',sans-serif", fontSize: "0.8rem", fontWeight: 800, background: view === "history" ? "#7c5cbf" : "#f2edfb", color: view === "history" ? "#fff" : "#7c5cbf", borderColor: view === "history" ? "#7c5cbf" : "#7c5cbf40" }}>
            📚 Archive{history.length > 0 ? ` (${history.length})` : ""}
          </button>
          <div style={{ background: "#e0faf7", color: "#0a7a6e", fontWeight: 800, fontSize: "0.72rem", padding: "5px 10px", borderRadius: 20, border: "2px solid #0cb8a6", marginLeft: 2 }}>Y5–6 · NZ</div>
        </div>
      </div>

      <div style={{ padding: "24px 40px 60px" }}>

        {/* HISTORY */}
        {view === "history" && (
          <div>
            <div style={{ fontFamily: "'Baloo 2',cursive", fontSize: "1.3rem", fontWeight: 800, marginBottom: 16, color: "#7c5cbf" }}>📚 Your Archive</div>
            {history.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 16, padding: "32px", textAlign: "center", border: "2px dashed #ece8e0", color: "#aaa" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>🗂️</div>
                <p style={{ fontWeight: 700 }}>No problems solved yet!</p>
                <p style={{ fontSize: "0.85rem" }}>Solve some problems and they'll show up here.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[...history].reverse().map((h, i) => (
                  <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "14px 18px", border: `2px solid ${h.correct ? "#34c77b40" : "#e8485540"}`, display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: h.correct ? "#e6faf1" : "#fdeaeb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", flexShrink: 0 }}>{h.correct ? "✅" : "❌"}</div>
                    <div onClick={() => replayFromHistory(h)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                      <div style={{ fontWeight: 800, fontSize: "0.85rem", marginBottom: 2 }}>{h.topic}</div>
                      <div style={{ fontSize: "0.78rem", color: "#8a8a9a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.text}</div>
                      <div style={{ fontSize: "0.72rem", color: "#7c5cbf", fontWeight: 700, marginTop: 3 }}>👁 View solution</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <div style={{ fontSize: "0.72rem", color: "#aaa" }}>{h.date}</div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: h.correct ? "#28a869" : "#e84855" }}>{h.correct ? "Correct!" : `Ans: ${h.answer}`}</div>
                      <button onClick={() => retryFromHistory(h)} style={{ background: "#fff0ea", color: "#ff6b35", border: "2px solid #ff6b3540", padding: "4px 10px", borderRadius: 50, fontFamily: "'Nunito',sans-serif", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}>🔄 Try Again</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SOLVE */}
        {view === "solve" && (<>

          {phase === "upload" && (<>
            <div style={{ background: "linear-gradient(135deg,#ff6b35,#ff9a5c)", borderRadius: 22, padding: "22px 28px", color: "#fff", marginBottom: 20, position: "relative", overflow: "hidden", boxShadow: "0 8px 28px rgba(255,107,53,0.28)" }}>
              <div style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", fontSize: "4rem", opacity: 0.18 }}>🧮</div>
              <div style={{ fontFamily: "'Baloo 2',cursive", fontSize: "1.4rem", fontWeight: 800, marginBottom: 5 }}>Hi! I'm your Maths Buddy 👋</div>
              <p style={{ fontSize: "0.88rem", opacity: 0.92, lineHeight: 1.6, maxWidth: 420 }}>Take a photo of your maths problem and I'll help you figure it out <strong>step by step</strong> — without just giving you the answer!</p>
            </div>
            <div style={{ background: "#fff", borderRadius: 20, padding: 24, border: "2px dashed #ece8e0", marginBottom: 18 }}>
              {!imgSrc ? (
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <div style={{ fontSize: "3rem", animation: "floatUp 2.5s ease-in-out infinite", marginBottom: 10 }}>📷</div>
                  <div style={{ fontFamily: "'Baloo 2',cursive", fontSize: "1.1rem", fontWeight: 700, marginBottom: 5 }}>Upload your problem</div>
                  <p style={{ color: "#8a8a9a", fontSize: "0.83rem", marginBottom: 14 }}>Photo or screenshot of your worksheet</p>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleImg(e.target.files[0])} />
                  <button onClick={() => fileRef.current.click()} style={{ background: "#ff6b35", color: "#fff", border: "none", padding: "10px 26px", borderRadius: 50, fontFamily: "'Nunito',sans-serif", fontSize: "0.92rem", fontWeight: 800, boxShadow: "0 4px 14px rgba(255,107,53,0.35)" }}>Choose Photo</button>
                </div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <img src={imgSrc} alt="problem" style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 13, border: "3px solid #ece8e0", boxShadow: "0 4px 14px rgba(0,0,0,0.08)" }} />
                  <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
                    <button onClick={() => { setImgSrc(null); setImgB64(null); }} style={btn("red", false)}>✕ Remove</button>
                    <button onClick={analyse} style={{ background: "linear-gradient(135deg,#0cb8a6,#0891b2)", color: "#fff", border: "none", padding: "11px 24px", borderRadius: 14, fontFamily: "'Baloo 2',cursive", fontSize: "1rem", fontWeight: 700, boxShadow: "0 4px 14px rgba(12,184,166,0.35)" }}>🔍 Let's look at this!</button>
                  </div>
                </div>
              )}
            </div>
          </>)}

          {/* CHAT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 13, marginBottom: 14 }}>
            {messages.map((m, i) => <Bubble key={i} role={m.role}>{m.content}</Bubble>)}
            {loading && <Dots />}
          </div>

          {/* HINT STEPS */}
          {hintSteps.length > 0 && visibleIdx >= 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
              {hintSteps.slice(0, visibleIdx + 1).map((step, idx) => (
                <div key={`step-${idx}`} style={{ animation: "slideIn 0.35s ease" }}>
                  <StepCard step={step} onComplete={() => onStepComplete(idx)} completed={phase === "done"} />
                </div>
              ))}
            </div>
          )}

          <div ref={bottomRef} />

          {/* ANSWER BOX */}
          {showAnswerBox && (
            <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", border: `2px solid ${phase === "done" ? (submittedAnswer?.correct ? "#34c77b" : "#e84855") : "#0cb8a6"}`, marginBottom: 10, boxShadow: "0 4px 16px rgba(12,184,166,0.1)", animation: "slideIn 0.35s ease" }}>
              <div style={{ fontWeight: 800, fontSize: "0.78rem", color: "#0a7a6e", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 9 }}>✏️ Answer Sheet</div>
              {phase === "done" && submittedAnswer ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    flex: 1, padding: "9px 13px", borderRadius: 11, fontFamily: "'Nunito',sans-serif",
                    fontSize: "0.95rem", fontWeight: 700,
                    background: submittedAnswer.correct ? "#e6faf1" : "#fdeaeb",
                    border: `2px solid ${submittedAnswer.correct ? "#34c77b60" : "#e8485560"}`,
                    color: submittedAnswer.correct ? "#1a7a4e" : "#c0392b"
                  }}>
                    {submittedAnswer.correct ? "✅" : "❌"} {submittedAnswer.text}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
                    <input value={answerText} onChange={e => setAnswerText(e.target.value)} onKeyDown={e => e.key === "Enter" && checkAnswer()}
                      placeholder={`Your answer… (include the ${analysis?.unit || "unit"}!)`}
                      style={{ flex: 1, minWidth: 150, padding: "9px 13px", border: "2px solid #ece8e0", borderRadius: 11, fontFamily: "'Nunito',sans-serif", fontSize: "0.92rem", fontWeight: 600, outline: "none" }} />
                    <button onClick={checkAnswer} style={{ background: "#34c77b", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 11, fontFamily: "'Nunito',sans-serif", fontSize: "0.88rem", fontWeight: 800, cursor: "pointer" }}>Check it! →</button>
                  </div>
                  <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <input ref={workingRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleWorking(e.target.files[0])} />
                    <button onClick={() => workingRef.current.click()} style={btn("teal", false)}>📎 Upload working photo</button>
                    {workingName && <span style={{ fontSize: "0.78rem", color: "#0cb8a6", fontWeight: 700 }}>✓ {workingName}</span>}
                  </div>
                </>
              )}
            </div>
          )}
          {/* BOTTOM BUTTONS */}
          {phase === "done" && (
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button onClick={reset} style={{
                flex: 1, background: "#fff", border: "2px dashed #ff6b35",
                color: "#ff6b35", padding: 13, borderRadius: 14,
                fontFamily: "'Baloo 2',cursive", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer"
              }}>✏️ New Problem</button>
              <button onClick={() => {
                setPhase("guided"); setHintSteps([]); setVisibleIdx(-1); setSubmittedAnswer(null); setAnswerText("");
                setMessages(prev => prev.slice(0, 1)); // keep analysis msg, drop answer msgs
              }} style={{
                flex: 1, background: "#fff", border: "2px dashed #7c5cbf",
                color: "#7c5cbf", padding: 13, borderRadius: 14,
                fontFamily: "'Baloo 2',cursive", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer"
              }}>🔄 Try Again</button>
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}
