/** Process effects of the workbench service, replaced in tests. */
import { openNativePath } from '@deepseek-ai/dsh-native-command'
import { callTool, type ToolCaller } from './call.ts'

/** Effects the service performs outside its own memory. */
export const internals: {
  /** Start an audit server, call one tool, and close it. */
  callTool: ToolCaller
  /** Open a path with the desktop's default application. */
  openPath: (path: string, signal: AbortSignal) => Promise<void>
} = {
  callTool,
  openPath: openNativePath,
}
