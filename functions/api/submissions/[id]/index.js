import { editSubmission, submissionDetails, withdrawSubmission } from "#server/submissions/index.js"

export const onRequestGet = submissionDetails
export const onRequestPatch = editSubmission
export const onRequestDelete = withdrawSubmission
