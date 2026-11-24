import Vue from "vue2/dist/vue.runtime.common.js"

Vue.config.productionTip = false
Vue.config.devtools = false

export const { computed, effectScope, markRaw, nextTick, onScopeDispose, reactive, ref, shallowReactive, shallowRef, toRaw, watch } = Vue
