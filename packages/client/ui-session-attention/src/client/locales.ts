/** Copy for Session notifications and their General settings rows. */
export const en = {
  'notice.attention.title': 'The agent needs your attention',
  'notice.completion.title': 'The agent has finished the task',
  'notice.question': '{session}: waiting for your answer',
  'notice.approval': '{session}: waiting for your approval',
  'notice.plan-review': '{session}: waiting for you to confirm the plan',
  'notice.other': '{session}: waiting for your action',
  'notice.completion': '{session}: this turn is complete',
  'notice.untitled': 'Untitled conversation',
  'settings.attention.title': 'Notify when the agent needs your attention',
  'settings.attention.description': 'Shows a system notification when the agent asks a question, requests approval, or waits for plan confirmation.',
  'settings.completion.title': 'Notify when the agent finishes a task',
  'settings.completion.description': 'Shows a system notification when a turn ends. The conversation on screen does not notify while the window is in front.',
  'settings.failed': 'Could not save the notification setting',
}

/** Chinese copy. */
export const zh: Record<keyof typeof en, string> = {
  'notice.attention.title': '智能体需要您处理',
  'notice.completion.title': '智能体已完成任务',
  'notice.question': '{session}：等待您回答问题',
  'notice.approval': '{session}：等待您审批',
  'notice.plan-review': '{session}：等待您确认方案',
  'notice.other': '{session}：等待您操作',
  'notice.completion': '{session}：本轮任务已完成',
  'notice.untitled': '未命名会话',
  'settings.attention.title': '智能体需要处理时发送系统通知',
  'settings.attention.description': '智能体提出问题、请求审批或等待确认方案时，发送系统通知提醒。',
  'settings.completion.title': '智能体完成任务时发送系统通知',
  'settings.completion.description': '每轮任务结束时发送系统通知提醒。窗口处于前台时，正在查看的会话不提醒。',
  'settings.failed': '无法保存通知设置',
}

/** Japanese copy, checked against the English keys. */
export const ja = {
  'notice.attention.title': 'エージェントが対応を求めています',
  'notice.completion.title': 'エージェントがタスクを完了しました',
  'notice.question': '{session}：回答を待っています',
  'notice.approval': '{session}：承認を待っています',
  'notice.plan-review': '{session}：プランの確認を待っています',
  'notice.other': '{session}：操作を待っています',
  'notice.completion': '{session}：このターンが完了しました',
  'notice.untitled': '無題の会話',
  'settings.attention.title': 'エージェントが対応を求めたときに通知',
  'settings.attention.description': 'エージェントが質問したとき、承認を求めたとき、またはプランの確認を待っているときにシステム通知を表示します。',
  'settings.completion.title': 'エージェントがタスクを完了したときに通知',
  'settings.completion.description': 'ターンが終了したときにシステム通知を表示します。ウィンドウが前面にあるとき、表示中の会話は通知しません。',
  'settings.failed': '通知設定を保存できませんでした',
} satisfies Record<keyof typeof en, string>

/** Spanish copy, checked against the English keys. */
export const es = {
  'notice.attention.title': 'El agente necesita su atención',
  'notice.completion.title': 'El agente ha terminado la tarea',
  'notice.question': '{session}: esperando su respuesta',
  'notice.approval': '{session}: esperando su aprobación',
  'notice.plan-review': '{session}: esperando que confirme el plan',
  'notice.other': '{session}: esperando su acción',
  'notice.completion': '{session}: este turno ha terminado',
  'notice.untitled': 'Conversación sin título',
  'settings.attention.title': 'Notificar cuando el agente necesite su atención',
  'settings.attention.description': 'Muestra una notificación del sistema cuando el agente hace una pregunta, solicita aprobación o espera la confirmación de un plan.',
  'settings.completion.title': 'Notificar cuando el agente termine una tarea',
  'settings.completion.description': 'Muestra una notificación del sistema al terminar un turno. La conversación en pantalla no notifica mientras la ventana está al frente.',
  'settings.failed': 'No se pudo guardar la configuración de notificaciones',
} satisfies Record<keyof typeof en, string>

/** French copy, checked against the English keys. */
export const fr = {
  'notice.attention.title': "L'agent a besoin de votre attention",
  'notice.completion.title': "L'agent a terminé la tâche",
  'notice.question': '{session} : en attente de votre réponse',
  'notice.approval': '{session} : en attente de votre approbation',
  'notice.plan-review': '{session} : en attente de la confirmation du plan',
  'notice.other': '{session} : en attente de votre action',
  'notice.completion': '{session} : ce tour est terminé',
  'notice.untitled': 'Conversation sans titre',
  'settings.attention.title': "Notifier quand l'agent a besoin de votre attention",
  'settings.attention.description': "Affiche une notification système quand l'agent pose une question, demande une approbation ou attend la confirmation d'un plan.",
  'settings.completion.title': "Notifier quand l'agent termine une tâche",
  'settings.completion.description': "Affiche une notification système à la fin d'un tour. La conversation affichée ne notifie pas tant que la fenêtre est au premier plan.",
  'settings.failed': "Impossible d'enregistrer le paramètre de notification",
} satisfies Record<keyof typeof en, string>

/** German copy, checked against the English keys. */
export const de = {
  'notice.attention.title': 'Der Agent benötigt Ihre Aufmerksamkeit',
  'notice.completion.title': 'Der Agent hat die Aufgabe abgeschlossen',
  'notice.question': '{session}: wartet auf Ihre Antwort',
  'notice.approval': '{session}: wartet auf Ihre Genehmigung',
  'notice.plan-review': '{session}: wartet auf Ihre Planbestätigung',
  'notice.other': '{session}: wartet auf Ihre Aktion',
  'notice.completion': '{session}: dieser Durchgang ist abgeschlossen',
  'notice.untitled': 'Unbenannte Unterhaltung',
  'settings.attention.title': 'Benachrichtigen, wenn der Agent Ihre Aufmerksamkeit benötigt',
  'settings.attention.description': 'Zeigt eine Systembenachrichtigung, wenn der Agent eine Frage stellt, eine Genehmigung anfordert oder auf eine Planbestätigung wartet.',
  'settings.completion.title': 'Benachrichtigen, wenn der Agent eine Aufgabe abschließt',
  'settings.completion.description': 'Zeigt eine Systembenachrichtigung am Ende eines Durchgangs. Die angezeigte Unterhaltung benachrichtigt nicht, solange das Fenster im Vordergrund ist.',
  'settings.failed': 'Die Benachrichtigungseinstellung konnte nicht gespeichert werden',
} satisfies Record<keyof typeof en, string>

/** Russian copy, checked against the English keys. */
export const ru = {
  'notice.attention.title': 'Агенту требуется ваше внимание',
  'notice.completion.title': 'Агент завершил задачу',
  'notice.question': '{session}: ожидает вашего ответа',
  'notice.approval': '{session}: ожидает вашего одобрения',
  'notice.plan-review': '{session}: ожидает подтверждения плана',
  'notice.other': '{session}: ожидает вашего действия',
  'notice.completion': '{session}: этот ход завершён',
  'notice.untitled': 'Беседа без названия',
  'settings.attention.title': 'Уведомлять, когда агенту требуется ваше внимание',
  'settings.attention.description': 'Показывает системное уведомление, когда агент задаёт вопрос, запрашивает одобрение или ожидает подтверждения плана.',
  'settings.completion.title': 'Уведомлять, когда агент завершает задачу',
  'settings.completion.description': 'Показывает системное уведомление по завершении хода. Открытая беседа не уведомляет, пока окно на переднем плане.',
  'settings.failed': 'Не удалось сохранить настройку уведомлений',
} satisfies Record<keyof typeof en, string>

/** Portuguese copy, checked against the English keys. */
export const pt = {
  'notice.attention.title': 'O agente precisa da sua atenção',
  'notice.completion.title': 'O agente concluiu a tarefa',
  'notice.question': '{session}: aguardando sua resposta',
  'notice.approval': '{session}: aguardando sua aprovação',
  'notice.plan-review': '{session}: aguardando a confirmação do plano',
  'notice.other': '{session}: aguardando sua ação',
  'notice.completion': '{session}: este turno foi concluído',
  'notice.untitled': 'Conversa sem título',
  'settings.attention.title': 'Notificar quando o agente precisar da sua atenção',
  'settings.attention.description': 'Mostra uma notificação do sistema quando o agente faz uma pergunta, solicita aprovação ou aguarda a confirmação de um plano.',
  'settings.completion.title': 'Notificar quando o agente concluir uma tarefa',
  'settings.completion.description': 'Mostra uma notificação do sistema ao final de um turno. A conversa na tela não notifica enquanto a janela está em primeiro plano.',
  'settings.failed': 'Não foi possível salvar a configuração de notificação',
} satisfies Record<keyof typeof en, string>
