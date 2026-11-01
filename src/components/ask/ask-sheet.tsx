"use client";

import { ArrowUp, Mic } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button, ButtonLink, Sheet, StatusMark } from "@/components/kit";
import { type VoiceError, useVoice } from "@/components/check/use-voice";
import { RecordRow, useLines } from "@/components/money/drill-sheet";
import { duesHref } from "@/components/money/dues-model";
import type { Answer } from "@/lib/ask/answer";
import type { AskQuery } from "@/lib/ask/query";
import { answerFigure, answerSentence, askSuggestions, periodRange } from "@/lib/ask/text";
import { useI18n } from "@/lib/i18n/client";
import { bnPossessive, riskText } from "@/lib/insights/text";

/** POST /api/ask's reply. The answer's figures arrive without their id lists: `proof` holds them once. */
type AskResult = { answer: Answer; proof: string[]; proofCount: number; byModel: boolean };
type AskError = "busy" | "failed" | "off" | "length" | "voice" | "voiceShort" | "denied";
type Stage = { s: "idle"; error: AskError | null } | { s: "asking"; question: string } | { s: "answer"; question: string; result: AskResult };

/** Lines shown at first, and at most after "more". */
const FIRST_LINES = 2;
const MORE_LINES = 50;

const VOICE_ERROR: Record<VoiceError, AskError> = { denied: "denied", too_short: "voiceShort", busy: "busy", failed: "voice", off: "off" };

function errorFor(status: number, code: unknown): AskError {
  if (code === "off" || code === "length") return code;
  return status === 429 ? "busy" : "failed";
}

/** The pill that opens the sheet: on Today under Scriba's note, and on History under the search. */
export function AskPill({ onOpen, solo }: { onOpen: () => void; solo?: boolean }) {
  const { t } = useI18n();
  return (
    <button type="button" className={solo ? "ask-pill solo" : "ask-pill"} onClick={onOpen}>
      <Mic size={20} aria-hidden="true" />
      {t("ask.title")}
    </button>
  );
}

/**
 * Ask Scriba: a question typed or spoken, or a suggestion tapped. The model only maps typed and
 * spoken words to a query shape; code computes the answer from confirmed lines, and the card
 * shows the lines that prove it. A suggestion is answered by code alone. Nothing is saved.
 * `name` is someone whose dues need a look, for the first suggestion.
 */
export function AskSheet({ open, onClose, name }: { open: boolean; onClose: () => void; name: string | null }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [stage, setStage] = useState<Stage>({ s: "idle", error: null });
  const [text, setText] = useState("");
  const pending = useRef<AbortController | null>(null);

  const send = async (question: string, body: { question: string } | { query: AskQuery }) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setStage({ s: "asking", question });
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      const reply = (await res.json().catch(() => null)) as (AskResult & { code?: unknown }) | null;
      if (controller.signal.aborted) return;
      if (!res.ok || !reply?.answer) setStage({ s: "idle", error: errorFor(res.status, reply?.code) });
      else setStage({ s: "answer", question, result: reply });
    } catch {
      if (!controller.signal.aborted) setStage({ s: "idle", error: "failed" });
    }
  };
  const askWords = (words: string) => {
    const question = words.replace(/\s+/g, " ").trim();
    if (question) void send(question, { question });
  };

  const voice = useVoice(i18n.locale, (_number, transcript) => {
    if (transcript.trim()) askWords(transcript);
    else setStage({ s: "idle", error: "voice" });
  });
  const { reset: resetVoice } = voice;

  // Closing drops a question still on its way and frees the mic; the next opening starts afresh.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setStage({ s: "idle", error: null });
      setText("");
    }
  }
  useEffect(() => {
    if (open) return;
    pending.current?.abort();
    resetVoice();
  }, [open, resetVoice]);

  const suggestions = askSuggestions(name, i18n);
  const sugs = (
    <div className="sugs">
      {suggestions.map((s) => (
        <button key={s.text} type="button" className="sug" onClick={() => void send(s.text, { query: s.query })}>
          {s.text}
        </button>
      ))}
    </div>
  );
  const echo = (question: string) => (
    <div className="ask-q">
      <span className="t-label">{t("ask.you")}</span>
      <b>{question}</b>
    </div>
  );

  let body;
  if (voice.state.s === "listening" || voice.state.s === "sending") {
    const listening = voice.state.s === "listening";
    body = (
      <div className="listen" aria-live="polite">
        <div className={listening ? "fx-bars" : "fx-bars still"} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <span className="t-label">{listening ? t("ask.listening") : t("ask.hearing")}</span>
        {listening ? (
          <Button variant="red" onClick={() => void voice.stop()}>
            {t("ask.stop")}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={resetVoice}>
          {t("ask.cancel")}
        </Button>
      </div>
    );
  } else if (stage.s === "asking") {
    body = (
      <>
        {echo(stage.question)}
        <div className="ask-wait" aria-live="polite">
          <div className="fx-bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <span className="t-label">{t("ask.thinking")}</span>
        </div>
      </>
    );
  } else if (stage.s === "answer") {
    body = (
      <AnswerView
        question={stage.question}
        result={stage.result}
        echo={echo}
        sugs={sugs}
        onAgain={() => {
          setText("");
          setStage({ s: "idle", error: null });
        }}
      />
    );
  } else {
    const voiceError = voice.state.s === "error" ? VOICE_ERROR[voice.state.error] : null;
    const error = stage.error ?? voiceError;
    const typed = text.trim().length > 0;
    const submit = (e: FormEvent) => {
      e.preventDefault();
      resetVoice();
      askWords(text);
    };
    body = (
      <>
        <h2 className="t-sec">{t("ask.title")}</h2>
        <p className="t-small">{t("ask.lead")}</p>
        <form className="ask-row" onSubmit={submit}>
          <input
            className="ask-field"
            value={text}
            maxLength={200}
            enterKeyHint="send"
            placeholder={t("ask.placeholder")}
            aria-label={t("ask.field")}
            onChange={(e) => setText(e.target.value)}
          />
          {typed || !voice.supported ? (
            <button type="submit" className="ask-go" aria-label={t("ask.send")} disabled={!typed}>
              <ArrowUp size={24} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="ask-go" aria-label={t("ask.mic")} onClick={() => void voice.start()}>
              <Mic size={24} aria-hidden="true" />
            </button>
          )}
        </form>
        {error ? (
          <div className="look-panel ask-err" role="status">
            <span>{t(`ask.err.${error}`)}</span>
          </div>
        ) : null}
        <span className="t-label ask-sub">{t("ask.eg")}</span>
        {sugs}
      </>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} label={t("ask.title")}>
      {body}
    </Sheet>
  );
}

/** The answer card: the number, one sentence, what it covers, the proof, and where to go next. */
function AnswerView({
  question,
  result,
  echo,
  sugs,
  onAgain,
}: {
  question: string;
  result: AskResult;
  echo: (question: string) => ReactNode;
  sugs: ReactNode;
  onAgain: () => void;
}) {
  const i18n = useI18n();
  const { t, money } = i18n;
  const { answer } = result;
  const sentence = answerSentence(answer, i18n);

  if (answer.kind === "unknown" || answer.kind === "not_found") {
    return (
      <>
        {echo(question)}
        <div className="look-panel" role="status">
          <span>{sentence}</span>
        </div>
        <span className="t-label ask-sub">{t("ask.try")}</span>
        {sugs}
      </>
    );
  }

  const figure = answerFigure(answer);
  const period = "period" in answer ? answer.period : answer.kind === "compare" ? answer.a.period : null;
  return (
    <>
      {echo(question)}
      <section className="card ans" aria-live="polite">
        <div className="stitch" aria-hidden="true" />
        <div className="ans-in">
          {figure !== null ? <span className="ans-n">{money(figure)}</span> : null}
          <p className="t-body">{sentence}</p>
          {period && answer.kind !== "drawer" ? <span className="t-small ans-range">{periodRange(period, i18n)}</span> : null}
          <Proof answer={answer} result={result} />
        </div>
      </section>
      <div className="ans-foot">
        <StatusMark kind="ok" />
        <span>{t(result.byModel ? "ask.foot" : "ask.foot.code")}</span>
      </div>
      <div className="ask-acts">
        {answer.kind === "due" ? (
          <ButtonLink href={`/parties/${answer.partyId}`} variant="line" wide>
            {t("ask.open.party", i18n.locale === "bn" ? bnPossessive(answer.name) : answer.name)}
          </ButtonLink>
        ) : answer.kind === "dues_total" || answer.kind === "risky" ? (
          <ButtonLink href={duesHref(answer.partyKind)} variant="line" wide>
            {t("ask.open.dues")}
          </ButtonLink>
        ) : null}
        <Button variant="ghost" wide onClick={onAgain}>
          {t("ask.again")}
        </Button>
      </div>
    </>
  );
}

function Proof({ answer, result }: { answer: Answer; result: AskResult }) {
  const i18n = useI18n();
  const { t, money } = i18n;

  if (answer.kind === "pick") {
    return (
      <div className="ans-proof ans-rows">
        {answer.options.map((o) => (
          <Link key={o.partyId} href={`/parties/${o.partyId}`} className="ans-day">
            <span>{o.name}</span>
            <span aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
    );
  }
  if (answer.kind === "risky") {
    if (answer.parties.length === 0) return null;
    return (
      <div className="ans-proof">
        <span className="t-label">{t("ask.proof.parties")}</span>
        <div className="ans-rows">
          {answer.parties.map((p) => (
            <Link key={p.partyId} href={`/parties/${p.partyId}`} className="ans-day">
              <span className="ans-who">
                {p.name}
                <span>{riskText(p.risk, answer.partyKind, i18n)}</span>
              </span>
              <b>{money(p.balancePoisha)}</b>
            </Link>
          ))}
        </div>
      </div>
    );
  }
  if (answer.kind === "compare") {
    return (
      <div className="ans-proof ans-rows">
        {[answer.a, answer.b].map((side) => (
          <div key={side.period.from} className="ans-day">
            <span>{periodRange(side.period, i18n)}</span>
            <b>{money(side.figure.poisha)}</b>
          </div>
        ))}
      </div>
    );
  }
  const parts = answer.kind === "sales" || answer.kind === "out" ? answer.parts.filter((p) => p.figure.poisha !== 0) : [];
  return (
    <>
      {parts.length > 1 ? (
        <div className="ans-proof">
          <span className="t-label">{t("ask.proof.parts")}</span>
          <div className="ans-rows">
            {parts.map((p) => (
              <div key={p.type} className="ans-day">
                <span>{t(`type.${p.type}`)}</span>
                <b>{money(p.figure.poisha)}</b>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <ProofLines ids={result.proof} count={result.proofCount} />
    </>
  );
}

/** The confirmed lines behind the answer, newest first: two at first, then up to fifty. */
function ProofLines({ ids, count }: { ids: string[]; count: number }) {
  const { t } = useI18n();
  const [more, setMore] = useState(false);
  const shown = ids.slice(0, more ? MORE_LINES : FIRST_LINES);
  const { lines, failed, retry } = useLines(shown.length > 0 ? shown : null);
  if (count === 0) {
    return (
      <div className="ans-proof">
        <span className="t-small">{t("ask.proof.none")}</span>
      </div>
    );
  }
  return (
    <div className="ans-proof">
      <span className="t-label">{t("ask.proof", count)}</span>
      {failed ? (
        <Button variant="ghost" onClick={retry}>
          {t("retry")}
        </Button>
      ) : (
        (lines ?? []).map((line) => <RecordRow key={line.id} line={line} />)
      )}
      {!more && count > FIRST_LINES ? (
        <button type="button" className="ans-more" onClick={() => setMore(true)}>
          {t("ask.more", Math.min(count, MORE_LINES) - FIRST_LINES)}
        </button>
      ) : null}
      {more && count > MORE_LINES ? <span className="t-small">{t("dt.rec.limit", MORE_LINES)}</span> : null}
    </div>
  );
}
