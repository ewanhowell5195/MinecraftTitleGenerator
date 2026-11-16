import { createSubmission, listSubmissions } from "../../../src/server/submissions/index.js"

export const onRequestGet = listSubmissions
export const onRequestPost = createSubmission
