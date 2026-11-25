import { createSubmission, listSubmissions } from "#server/submissions/index.js"

export const onRequestGet = listSubmissions
export const onRequestPost = createSubmission
