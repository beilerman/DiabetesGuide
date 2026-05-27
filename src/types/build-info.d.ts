declare const __APP_BUILD_INFO__: {
  version: string
  gitSha: string
  buildDate: string
  catalogSnapshotDate: string
}

declare module '*.md?raw' {
  const content: string
  export default content
}
