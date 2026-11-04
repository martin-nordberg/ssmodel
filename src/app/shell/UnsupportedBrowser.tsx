export function UnsupportedBrowser() {
  return (
    <main className="mx-auto max-w-lg p-8 text-sm">
      <h1 className="mb-2 font-semibold text-lg">Chromium-based browser required</h1>
      <p>
        This app opens and saves files with the File System Access API, which is available in Chrome, Edge, Brave and
        Opera. Please open it in one of those browsers.
      </p>
    </main>
  )
}
