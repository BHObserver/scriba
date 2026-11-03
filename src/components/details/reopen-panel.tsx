"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { checkHref } from "@/components/check/back-href";
import type { Review } from "@/components/check/deck-model";
import { ReopenSheet } from "@/components/check/reopen-sheet";
import { httpReviewApi } from "@/components/check/review-api";
import { Button } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";

/**
 * "Fix this page" on the page's details screen (T5), for a page in the khata. The same sheet as
 * the check screen's seal; once the page is out of the khata, the check screen opens on it.
 */
export function ReopenPanel({ documentId, runId, review }: { documentId: string; runId: string; review: Review }) {
  const { t } = useI18n();
  const router = useRouter();
  const api = useMemo(() => httpReviewApi(runId), [runId]);
  const [open, setOpen] = useState(false);
  return (
    <div className="p-4">
      <Button variant="line" wide onClick={() => setOpen(true)}>
        {t("ro.cta")}
      </Button>
      <ReopenSheet
        open={open}
        api={api}
        review={review}
        onReopened={() => {
          setOpen(false);
          router.push(checkHref(documentId));
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
