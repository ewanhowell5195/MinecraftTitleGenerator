import { editSubmission, submissionDetails, withdrawSubmission } from "../../../../src/server/submissions/index.js"

export const onRequestGet = submissionDetails
export const onRequestPatch = editSubmission
export const onRequestDelete = withdrawSubmission
