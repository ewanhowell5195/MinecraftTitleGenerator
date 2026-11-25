import { connect, disconnect, listConnections } from "#server/connecting.js"

export const onRequestGet = listConnections
export const onRequestPost = connect
export const onRequestDelete = disconnect
