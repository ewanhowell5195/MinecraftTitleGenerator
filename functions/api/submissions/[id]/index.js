import { editSubmission, submissionDetails, withdrawSubmission } from "../../../../src/server/submissions.js"

export const onRequestGet = submissionDetails
export const onRequestPatch = editSubmission
export const onRequestDelete = withdrawSubmission
