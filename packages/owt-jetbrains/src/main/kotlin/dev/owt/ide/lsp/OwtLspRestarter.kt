@file:Suppress("DEPRECATION")

package dev.owt.ide.lsp

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.platform.lsp.api.LspServerManager
import dev.owt.ide.OwtNotifications
import dev.owt.ide.settings.OwtSettings
import dev.owt.ide.settings.OwtSettingsListener

internal object OwtLspRestarter {
    /**
     * Stops the OWT server of [project] and starts it again if an `.owt` file is open
     * (the provider's `fileOpened` re-resolves Node.js / the server script / tsdk).
     */
    fun restart(project: Project) {
        if (project.isDisposed) return
        OwtNotifications.reset(project)
        ApplicationManager.getApplication().invokeLater({
            if (!project.isDisposed) {
                LspServerManager.getInstance(project).stopAndRestartIfNeeded(OwtLspServerSupportProvider::class.java)
            }
        }, project.disposed)
    }

    fun restartAll() {
        ProjectManager.getInstance().openProjects.forEach(::restart)
    }
}

/** Restarts the language servers after Settings | Languages & Frameworks | OWT was applied. */
class OwtLspSettingsListener : OwtSettingsListener {
    override fun settingsChanged(settings: OwtSettings) {
        OwtLspRestarter.restartAll()
    }
}
