/** Workbench dialogs: the prompt preview, the Built-in Model list, and the new audit project. */
import { Button, IconLoadingOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PromptRequest, WorkbenchModel } from '@deepseek-ai/dsh-audit-workbench/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { Translate } from './format.ts'
import css from './WorkbenchPage.module.css'

/** A prompt the page is preparing or has prepared for a new Session. */
export type PromptDialogState = {
  readonly request: PromptRequest
  /** Dialog heading naming the action. */
  readonly title: string
  /** Title of the Workspace the Session opens in; empty when the Workspace is gone. */
  readonly workspace: string
} & (
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly prompt: string }
  | { readonly phase: 'failed'; readonly message: string }
)

/** The new audit project dialog: no directory, a chosen one, its Workspace being added, or added without a prompt. */
export type NewProjectState =
  | { readonly phase: 'empty' }
  | { readonly phase: 'chosen'; readonly path: string; readonly message?: string }
  | { readonly phase: 'creating'; readonly path: string }
  | { readonly phase: 'created'; readonly path: string; readonly message: string }

/**
 * Centered loading mark.
 * @returns a busy region holding one spinning icon.
 */
export function Spinner() {
  return (
    <div className={css.spinner} aria-busy="true">
      <IconLoadingOutlineRegular size={20} className={css.spinIcon} />
    </div>
  )
}

interface PromptDialogProps {
  readonly state: PromptDialogState
  readonly t: Translate
  readonly onClose: () => void
  /** Open the Session with the prepared prompt. */
  readonly onConfirm: (workspaceId: WorkspaceId, prompt: string) => void
}

/**
 * Show the prompt a new Session will receive in its input box.
 * @param props - the prompt state, copy, and the close and confirm actions.
 * @returns the dialog.
 */
export function PromptDialog({ state, t, onClose, onConfirm }: PromptDialogProps) {
  const prompt = state.phase === 'ready' ? state.prompt : undefined
  return (
    <Modal
      open
      onClose={onClose}
      title={state.title}
      closeLabel={t('close')}
      {...state.workspace === '' ? {} : { description: t('prompt.workspace', { name: state.workspace }) }}
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
          <Button
            variant="primary"
            disabled={prompt === undefined}
            onClick={prompt === undefined ? undefined : () => { onConfirm(state.request.workspaceId, prompt) }}
            data-modal-autofocus
          >
            {t('prompt.confirm')}
          </Button>
        </>
      )}
    >
      {state.phase === 'loading' && <Spinner />}
      {state.phase === 'failed' && <div className={css.notice} role="alert">{state.message}</div>}
      {prompt !== undefined && (
        <div className={css.dialogBody}>
          <p className={css.caption}>{t('prompt.preview')}</p>
          <pre className={css.promptText}>{prompt}</pre>
          <p className={css.caption}>{t('prompt.notSent')}</p>
        </div>
      )}
    </Modal>
  )
}

interface ModelsDialogProps {
  readonly models: readonly WorkbenchModel[]
  readonly t: Translate
  readonly onClose: () => void
  readonly onPick: (model: WorkbenchModel) => void
}

/**
 * List the pack's Built-in Models for one project.
 * @param props - the models, copy, and the close and pick actions.
 * @returns the dialog.
 */
export function ModelsDialog({ models, t, onClose, onPick }: ModelsDialogProps) {
  return (
    <Modal
      open
      onClose={onClose}
      title={t('models.title')}
      closeLabel={t('close')}
      description={t('models.description')}
      footer={<Button variant="outline" onClick={onClose}>{t('cancel')}</Button>}
    >
      {models.length === 0
        ? <p className={css.caption}>{t('models.empty')}</p>
        : (
          <ul className={css.modelList}>
            {models.map(model => (
              <li key={model.id}>
                <button type="button" className={css.modelRow} onClick={() => { onPick(model) }}>
                  <span className={css.cardTitle}>{model.title}</span>
                  {model.description !== '' && <span className={css.caption}>{model.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
    </Modal>
  )
}

interface NewProjectDialogProps {
  readonly state: NewProjectState
  readonly t: Translate
  readonly onClose: () => void
  readonly onPick: () => void
  readonly onConfirm: (path: string) => void
}

/**
 * Choose a Project Directory, add it as a Workspace, and open a Session with the kickoff prompt.
 * @param props - the dialog state, copy, and its actions.
 * @returns the dialog.
 */
export function NewProjectDialog({ state, t, onClose, onPick, onConfirm }: NewProjectDialogProps) {
  const path = state.phase === 'empty' ? undefined : state.path
  const message = state.phase === 'chosen' || state.phase === 'created' ? state.message : undefined
  return (
    <Modal
      open
      onClose={onClose}
      title={t('new.title')}
      closeLabel={t('close')}
      description={t('new.description')}
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>{t(state.phase === 'created' ? 'close' : 'cancel')}</Button>
          {state.phase !== 'created' && (
            <Button
              variant="primary"
              disabled={state.phase !== 'chosen'}
              onClick={state.phase === 'chosen' ? () => { onConfirm(state.path) } : undefined}
            >
              {t('new.confirm')}
            </Button>
          )}
        </>
      )}
    >
      <div className={css.dialogBody}>
        <div className={css.directoryRow}>
          <span className={path === undefined ? css.caption : css.path}>{path ?? t('new.noDirectory')}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={state.phase === 'creating' || state.phase === 'created'}
            onClick={onPick}
            data-modal-autofocus
          >
            {t('new.pick')}
          </Button>
        </div>
        {message !== undefined && <div className={css.notice} role="alert">{message}</div>}
        <p className={css.caption}>{t('new.hint')}</p>
      </div>
    </Modal>
  )
}
