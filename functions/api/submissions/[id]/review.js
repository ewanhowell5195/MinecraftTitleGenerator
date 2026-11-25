import { reviewState, reviewSubmission } from "#server/submissions/review.js"

export const onRequestGet = reviewState
export const onRequestPost = reviewSubmission
