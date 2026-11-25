import { createIssue, listIssues } from "#server/issues/index.js"

export const onRequestGet = listIssues
export const onRequestPost = createIssue
