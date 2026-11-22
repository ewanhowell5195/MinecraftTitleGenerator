import { createIssue, listIssues } from "../../../src/server/issues/index.js"

export const onRequestGet = listIssues
export const onRequestPost = createIssue
