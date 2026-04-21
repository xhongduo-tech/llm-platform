import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

export type CodeLang = "python" | "bash" | "javascript";

// VS Code Dark+ color palette
const C = {
  bg: "#1e1e1e",
  header: "#252526",
  border: "#3e3e3e",
  lineNum: "#6e7681",
  comment: "#6a9955",
  string: "#ce9178",
  keyword: "#569cd6",
  number: "#b5cea8",
  builtin: "#4ec9b0",
  func: "#dcdcaa",
  decorator: "#c586c0",
  url: "#4fc1ff",
  operator: "#d4d4d4",
  plain: "#d4d4d4",
  type: "#4ec9b0",
};

type TokenRule = [string, string]; // [regex source, color]

const RULES: Record<CodeLang, TokenRule[]> = {
  python: [
    ['#[^\\n]*', C.comment],
    ['"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'', C.string],
    ['f?"(?:[^"\\\\]|\\\\.)*"|f?\'(?:[^\'\\\\]|\\\\.)*\'', C.string],
    ['@\\w+', C.decorator],
    ['\\b(?:from|import|def|class|return|if|elif|else|for|while|try|except|finally|with|as|not|and|or|in|is|True|False|None|await|async|pass|break|continue|raise|lambda|yield)\\b', C.keyword],
    ['\\b(?:print|len|range|str|int|float|list|dict|set|tuple|open|type|isinstance|super|self|OpenAI|base64|json|requests|stream|chunk|delta|response|message|tool_calls?|arguments|client|tools)\\b', C.builtin],
    ['\\b\\d+\\.?\\d*\\b', C.number],
    ['\\b\\w+(?=\\s*\\()', C.func],
  ],
  bash: [
    ['"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'', C.string],
    ['https?:\\/\\/[^\\s"\'\\\\,}]+', C.url],
    ['\\b(?:curl|POST|GET|PUT|DELETE|PATCH)\\b', C.keyword],
    ['-[a-zA-Z]\\b|--[\\w-]+', C.keyword],
    ['\\\\$', C.operator],
    ['\\b\\d+\\b', C.number],
  ],
  javascript: [
    ['\\/\\/[^\\n]*', C.comment],
    ['`(?:[^`\\\\]|\\\\.)*`', C.string],
    ['"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'', C.string],
    ['\\b(?:import|export|from|const|let|var|function|return|if|else|for|while|try|catch|finally|class|new|await|async|of|in|true|false|null|undefined|throw|this)\\b', C.keyword],
    ['\\b(?:OpenAI|console|process|Buffer|fetch|JSON|Math|Object|Array|Promise|Error)\\b', C.builtin],
    ['\\b\\d+\\.?\\d*\\b', C.number],
    ['\\b\\w+(?=\\s*\\()', C.func],
  ],
};

interface Tok { text: string; color: string }

function tokenize(code: string, lang: CodeLang): Tok[] {
  const rules = RULES[lang];
  const marked = new Uint8Array(code.length);
  const tokens: { start: number; end: number; color: string }[] = [];

  for (const [src, color] of rules) {
    const re = new RegExp(src, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      const s = m.index, e = s + m[0].length;
      let overlaps = false;
      for (let i = s; i < e; i++) {
        if (marked[i]) { overlaps = true; break; }
      }
      if (!overlaps) {
        tokens.push({ start: s, end: e, color });
        for (let i = s; i < e; i++) marked[i] = 1;
      }
    }
  }

  tokens.sort((a, b) => a.start - b.start);

  const result: Tok[] = [];
  let pos = 0;
  for (const tok of tokens) {
    if (tok.start > pos) result.push({ text: code.slice(pos, tok.start), color: C.plain });
    result.push({ text: code.slice(tok.start, tok.end), color: tok.color });
    pos = tok.end;
  }
  if (pos < code.length) result.push({ text: code.slice(pos), color: C.plain });

  return result;
}

interface CodeBlockProps {
  code: string;
  lang: CodeLang;
  label?: string;
  maxHeight?: number;
}

export function CodeBlock({ code, lang, label, maxHeight }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const toks = tokenize(code, lang);
  const lineCount = (code.match(/\n/g) || []).length + 1;

  const handleCopy = () => {
    const copy = (text: string) => {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).catch(() => fallback(text));
      } else {
        fallback(text);
      }
    };
    const fallback = (text: string) => {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      try { document.execCommand("copy"); } catch { /* silent */ }
      document.body.removeChild(el);
    };
    copy(code);
    setCopied(true);
    toast.success("已复制");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: C.bg, border: `1px solid ${C.border}` }}
    >
      {/* Titlebar */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ backgroundColor: C.header, borderBottom: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-3">
          {/* Traffic lights */}
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#ff5f57" }} />
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#febc2e" }} />
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#28c840" }} />
          </div>
          {label && (
            <span className="text-[11px]" style={{ color: "#8c8c8c", fontFamily: "'JetBrains Mono', monospace" }}>
              {label}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="btn-tap flex items-center gap-1.5 transition-colors"
          style={{ color: copied ? "#4ec9b0" : "#8c8c8c", fontSize: "11px", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: "4px" }}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>

      {/* Code area */}
      <div
        className="overflow-auto"
        style={{ maxHeight: maxHeight ? `${maxHeight}px` : undefined, scrollbarWidth: "thin" }}
      >
        <div className="flex min-w-fit">
          {/* Line numbers */}
          <div
            className="select-none py-4 pr-4 pl-4 text-right shrink-0"
            style={{
              color: C.lineNum,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "12.5px",
              lineHeight: "1.8",
              minWidth: "44px",
              borderRight: `1px solid ${C.border}`,
            }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>

          {/* Highlighted code */}
          <pre
            className="py-4 px-5 flex-1"
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12.5px", lineHeight: "1.8", margin: 0 }}
          >
            {toks.map((tok, i) => (
              <span key={i} style={{ color: tok.color }}>
                {tok.text}
              </span>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}