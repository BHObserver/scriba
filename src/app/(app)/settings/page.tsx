import { Card, CardHeader, Notice, Pill } from "@/components/ui";
import { configurationStatus, getLimitsConfig, getMetaConfig } from "@/lib/config";
import { PROMPT_VERSION } from "@/lib/extraction/prompt";
import { SCHEMA_VERSION } from "@/lib/extraction/schema";
import { METRICS_VERSION } from "@/lib/evaluation/metrics";
import { PRICING_SOURCE, isContributorModel } from "@/lib/pricing";
import { VALIDATOR_VERSION } from "@/lib/validation/engine";

/** Shows which settings are present. Never displays a secret value. */
export default function SettingsPage() {
  const status = configurationStatus();
  const meta = getMetaConfig();
  const limits = getLimitsConfig();
  const rows: Array<[string, boolean, string]> = [
    ["NEXT_PUBLIC_SUPABASE_URL", status.supabaseUrl, "Dedicated Scriba Supabase project URL"],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", status.supabasePublishableKey, "Browser key; access limited by RLS"],
    ["SUPABASE_SECRET_KEY", status.supabaseSecretKey, "Server only: extraction results, confirmations, evaluations"],
    ["META_MODEL_API_KEY", status.metaApiKey, "Server only: Meta Model API"],
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Card>
        <CardHeader title="Configuration" subtitle="Values are read from server environment variables." />
        <ul className="divide-y divide-rule text-sm">
          {rows.map(([name, ok, help]) => (
            <li key={name} className="flex flex-wrap items-center gap-3 px-4 py-2">
              <code className="text-xs">{name}</code>
              <Pill tone={ok ? "pass" : "fail"}>{ok ? "set" : "missing"}</Pill>
              <span className="text-xs text-ink-soft">{help}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Extraction" />
        <dl className="grid gap-x-6 gap-y-1 p-4 text-sm sm:grid-cols-2">
          <dt className="text-ink-soft">Model</dt><dd>{meta.modelId} {isContributorModel(meta.modelId) ? <Pill tone="warn">contributor mode: content may be used for training</Pill> : <Pill tone="pass">standard mode</Pill>}</dd>
          <dt className="text-ink-soft">Endpoint</dt><dd>{meta.baseURL}/responses (stored: no)</dd>
          <dt className="text-ink-soft">Reasoning effort</dt><dd>{meta.reasoningEffort}</dd>
          <dt className="text-ink-soft">Output budget</dt><dd>{meta.maxOutputTokens} tokens (includes reasoning)</dd>
          <dt className="text-ink-soft">Timeout</dt><dd>{Math.round(meta.timeoutMs / 1000)} s, never retried automatically</dd>
          <dt className="text-ink-soft">Upload limit</dt><dd>{(limits.maxUploadBytes / 1024 / 1024).toFixed(1)} MB</dd>
          <dt className="text-ink-soft">Paid requests per user</dt><dd>{limits.extractionsPerHour}/hour, {limits.extractionsPerDay}/day</dd>
          <dt className="text-ink-soft">Extraction allow-list</dt><dd>{limits.extractionAllowedEmails.length > 0 ? `${limits.extractionAllowedEmails.length} account(s)` : "any signed-in user"}</dd>
          <dt className="text-ink-soft">Versions</dt><dd className="text-xs">{PROMPT_VERSION} · {SCHEMA_VERSION} · {VALIDATOR_VERSION} · {METRICS_VERSION}</dd>
          <dt className="text-ink-soft">Pricing source</dt><dd className="text-xs"><a className="text-accent hover:underline" href={PRICING_SOURCE.url}>{PRICING_SOURCE.url}</a> ({PRICING_SOURCE.retrieved})</dd>
        </dl>
      </Card>
      <Notice tone="info">
        Privacy: originals stay in a private bucket and are sent to Meta only when you click Analyze, with response storage disabled. Use synthetic or consented ledgers only. See docs/SECURITY_AND_PRIVACY.md for the retirement checklist.
      </Notice>
    </div>
  );
}
