package dev.owt.ide.lsp

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import dev.owt.ide.settings.OwtSettings

/** Tools | Restart OWT Language Server. */
class OwtRestartLanguageServerAction : DumbAwareAction() {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null && OwtSettings.getInstance().lspEnabled
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        OwtLspRestarter.restart(project)
    }
}
