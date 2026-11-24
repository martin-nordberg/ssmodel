// Picking the household's .checquery file to convert [FR-MIG-1]. The conversion itself runs in the store worker
// (src/store/ledger/convertChecquery.ts); the flow is convertChecqueryFile in plensFile.ts.

const types: FilePickerAcceptType[] = [
  { description: 'Checquery file', accept: { 'application/x-checquery': ['.checquery'] } },
]

/** Asks for a .checquery file; null when the user cancels. */
export async function pickChecquery(): Promise<FileSystemFileHandle | null> {
  try {
    const [handle] = await window.showOpenFilePicker!({ types, id: 'checquery' })
    return handle ?? null
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  }
}
