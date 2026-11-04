// Minimal File System Access API typings (Chromium only; not in the TS DOM lib).
interface FilePickerAcceptType {
  description?: string
  accept: Record<string, string[]>
}
interface OpenFilePickerOptions {
  types?: FilePickerAcceptType[]
  excludeAcceptAllOption?: boolean
  multiple?: boolean
  id?: string
}
interface SaveFilePickerOptions {
  types?: FilePickerAcceptType[]
  suggestedName?: string
  excludeAcceptAllOption?: boolean
  id?: string
}
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}
interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}
interface Window {
  showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
  showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
}
