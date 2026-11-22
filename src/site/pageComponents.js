export const PAGE_COMPONENTS = {
  home: () => import("./home/HomePage.vue"),
  app: () => import("../app/App.vue"),
  "font-editor": () => import("../fontEditor/FontEditor.vue"),
  credits: () => import("./credits/CreditsPage.vue"),
  submit: () => import("../submissions/SubmissionsApp.vue"),
  submissions: () => import("../submissions/SubmissionsApp.vue"),
  issues: () => import("../issues/IssuesApp.vue"),
  account: () => import("../submissions/SubmissionsApp.vue"),
  terms: () => import("./legal/TermsPage.vue"),
  privacy: () => import("./legal/PrivacyPage.vue"),
  "not-found": () => import("./NotFound.vue")
}
