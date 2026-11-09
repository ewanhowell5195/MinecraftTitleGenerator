import { createSubmission, listSubmissions } from "../../../src/server/submissions.js"

export const onRequestGet = listSubmissions
export const onRequestPost = createSubmission
