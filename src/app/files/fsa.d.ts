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
interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
}
interface Window {
  showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
  showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
  showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
}

// File Handling API: files the OS opened the installed app with (Chromium only).
interface LaunchParams {
  readonly targetURL?: string
  readonly files: readonly FileSystemHandle[]
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void
}
interface Window {
  launchQueue?: LaunchQueue
}
