export const AMENDMENT_REASON_ERROR =
  'Please enter a reason for this amendment.';
export const CHANGE_REQUEST_REASON_ERROR =
  'Please enter a reason for this change request.';

export function requiredText(value: string | undefined) {
  return value?.trim() ?? '';
}

export function optionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function mapAmendmentValidationIssues(
  issues: ReadonlyArray<{ message: string; path: PropertyKey[] }>,
  mode: 'amendment' | 'change-request',
) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? 'form');
    const message =
      field === 'amendmentReason' || field === 'reason'
        ? mode === 'amendment'
          ? AMENDMENT_REASON_ERROR
          : CHANGE_REQUEST_REASON_ERROR
        : issue.message;
    fieldErrors[field] ??= message;
  }
  return {
    fieldErrors,
    summary:
      fieldErrors.amendmentReason ??
      fieldErrors.reason ??
      'Please review the highlighted request details.',
  };
}

export function friendlyAmendmentSubmissionError(status: number) {
  if (status === 409)
    return 'This request changed while you were editing it. Refresh and review the latest revision before submitting again.';
  if (status === 400 || status === 422)
    return 'Please review the amendment details and correct the highlighted fields.';
  if (status === 401 || status === 403 || status === 404)
    return 'This request is no longer available for amendment.';
  return 'The amendment could not be submitted. Please try again.';
}
